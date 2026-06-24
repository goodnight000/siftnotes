#!/usr/bin/env python3

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree


NITE_NS = "{http://nite.sourceforge.net/}"
ID_RANGE_RE = re.compile(r"id\(([^)]+)\)")
WORD_INDEX_RE = re.compile(r"words(\d+)$")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Convert public AMI NXT segment/word annotations into RTTM and Meetily transcript fixtures."
    )
    parser.add_argument("--meeting-id", required=True)
    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument("--annotations-dir")
    source_group.add_argument("--annotations-zip")
    parser.add_argument("--clip-start-seconds", type=float)
    parser.add_argument("--clip-end-seconds", type=float)
    parser.add_argument("--output-rttm", required=True)
    parser.add_argument("--output-transcripts", required=True)
    args = parser.parse_args()
    if (
        args.clip_start_seconds is not None
        and args.clip_end_seconds is not None
        and args.clip_end_seconds <= args.clip_start_seconds
    ):
        parser.error("--clip-end-seconds must be greater than --clip-start-seconds")
    return args


def local_name(tag):
    return tag.rsplit("}", 1)[-1]


def xml_attr(element, name):
    if name in element.attrib:
        return element.attrib[name]
    namespaced = f"{NITE_NS}{name}"
    if namespaced in element.attrib:
        return element.attrib[namespaced]
    return None


class AnnotationSource:
    def __init__(self, annotations_dir=None, annotations_zip=None):
        self.annotations_dir = Path(annotations_dir) if annotations_dir else None
        self.annotations_zip = Path(annotations_zip) if annotations_zip else None
        self._zip_file = None

    def __enter__(self):
        if self.annotations_zip:
            self._zip_file = zipfile.ZipFile(self.annotations_zip)
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        if self._zip_file:
            self._zip_file.close()

    def segment_paths(self, meeting_id):
        suffix = ".segments.xml"
        if self.annotations_dir:
            base = self.annotations_dir / "segments"
            return sorted(
                f"segments/{path.name}"
                for path in base.glob(f"{meeting_id}.*{suffix}")
            )

        return sorted(
            name
            for name in self._zip_file.namelist()
            if name.startswith(f"segments/{meeting_id}.") and name.endswith(suffix)
        )

    def read_xml(self, relative_path):
        if self.annotations_dir:
            data = (self.annotations_dir / relative_path).read_bytes()
        else:
            data = self._zip_file.read(relative_path)
        return ElementTree.fromstring(data)


def speaker_from_segment_path(meeting_id, relative_path):
    filename = Path(relative_path).name
    prefix = f"{meeting_id}."
    suffix = ".segments.xml"
    if not filename.startswith(prefix) or not filename.endswith(suffix):
        raise ValueError(f"Unexpected AMI segment filename for {meeting_id}: {filename}")
    return filename[len(prefix):-len(suffix)]


def word_index(word_id):
    match = WORD_INDEX_RE.search(word_id)
    if not match:
        return None
    return int(match.group(1))


def load_words(source, meeting_id, speaker):
    words_path = f"words/{meeting_id}.{speaker}.words.xml"
    root = source.read_xml(words_path)
    words = {}

    for element in root.iter():
        if local_name(element.tag) != "w":
            continue
        word_id = xml_attr(element, "id")
        if not word_id:
            continue
        index = word_index(word_id)
        if index is None:
            continue
        text = (element.text or "").strip()
        if not text:
            continue
        words[index] = {
            "id": word_id,
            "text": text,
            "punctuation": element.attrib.get("punc") == "true",
        }

    return words


def text_from_child_refs(segment, words):
    ids = []
    for child in segment:
        if local_name(child.tag) != "child":
            continue
        href = child.attrib.get("href", "")
        ids.extend(ID_RANGE_RE.findall(href))

    if not ids:
        return ""

    if len(ids) == 1:
        indexes = [word_index(ids[0])]
    else:
        start = word_index(ids[0])
        end = word_index(ids[-1])
        if start is None or end is None:
            indexes = []
        else:
            indexes = list(range(start, end + 1))

    pieces = []
    for index in indexes:
        if index is None or index not in words:
            continue
        token = words[index]
        if token["punctuation"] and pieces:
            pieces[-1] = f"{pieces[-1]}{token['text']}"
        else:
            pieces.append(token["text"])

    return " ".join(pieces)


def round_time(value):
    return round(float(value), 3)


def timestamp_for(start):
    total_ms = int(round(float(start) * 1000))
    seconds, ms = divmod(total_ms, 1000)
    minutes, seconds = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}.{ms:03d}"


def clip_segment(start, end, clip_start, clip_end):
    if clip_start is None and clip_end is None:
        return start, end

    clipped_start = max(start, clip_start if clip_start is not None else start)
    clipped_end = min(end, clip_end if clip_end is not None else end)
    if clipped_end <= clipped_start:
        return None

    offset = clip_start if clip_start is not None else 0
    return round_time(clipped_start - offset), round_time(clipped_end - offset)


def convert(source, meeting_id, clip_start=None, clip_end=None):
    rttm_turns = []
    transcripts = []
    speaker_counts = {}

    for segment_path in source.segment_paths(meeting_id):
        speaker = speaker_from_segment_path(meeting_id, segment_path)
        speaker_label = f"AMI_{speaker}"
        words = load_words(source, meeting_id, speaker)
        root = source.read_xml(segment_path)

        for segment in root.iter():
            if local_name(segment.tag) != "segment":
                continue
            start_raw = segment.attrib.get("transcriber_start")
            end_raw = segment.attrib.get("transcriber_end")
            if start_raw is None or end_raw is None:
                continue

            start = round_time(start_raw)
            end = round_time(end_raw)
            if end <= start:
                continue

            clipped = clip_segment(start, end, clip_start, clip_end)
            if clipped is None:
                continue
            relative_start, relative_end = clipped

            speaker_counts[speaker] = speaker_counts.get(speaker, 0) + 1
            segment_index = speaker_counts[speaker]
            text = text_from_child_refs(segment, words)

            rttm_turns.append({
                "meeting": meeting_id,
                "start": relative_start,
                "end": relative_end,
                "speaker": speaker_label,
            })
            transcripts.append({
                "id": f"{meeting_id}-{speaker}-{segment_index:04d}",
                "text": text,
                "timestamp": timestamp_for(relative_start),
                "audio_start_time": relative_start,
                "audio_end_time": relative_end,
                "sourceSpeaker": speaker_label,
            })

    rttm_turns.sort(key=lambda turn: (turn["start"], turn["end"], turn["speaker"]))
    transcripts.sort(key=lambda segment: (
        segment["audio_start_time"],
        segment["audio_end_time"],
        segment["sourceSpeaker"],
    ))
    return rttm_turns, transcripts


def write_outputs(rttm_turns, transcripts, output_rttm, output_transcripts):
    output_rttm = Path(output_rttm)
    output_transcripts = Path(output_transcripts)
    output_rttm.parent.mkdir(parents=True, exist_ok=True)
    output_transcripts.parent.mkdir(parents=True, exist_ok=True)

    with output_rttm.open("w", encoding="utf-8") as handle:
        for turn in rttm_turns:
            duration = round_time(turn["end"] - turn["start"])
            handle.write(
                f"SPEAKER {turn['meeting']} 1 {turn['start']:.3f} {duration:.3f} "
                f"<NA> <NA> {turn['speaker']} <NA> <NA>\n"
            )

    output_transcripts.write_text(
        f"{json.dumps(transcripts, indent=2)}\n",
        encoding="utf-8",
    )


def main():
    args = parse_args()
    with AnnotationSource(args.annotations_dir, args.annotations_zip) as source:
        rttm_turns, transcripts = convert(
            source,
            args.meeting_id,
            clip_start=args.clip_start_seconds,
            clip_end=args.clip_end_seconds,
        )
    if not rttm_turns:
        print(f"No AMI segments found for meeting {args.meeting_id}", file=sys.stderr)
        return 1

    write_outputs(rttm_turns, transcripts, args.output_rttm, args.output_transcripts)
    print(json.dumps({
        "meetingId": args.meeting_id,
        "turnCount": len(rttm_turns),
        "transcriptSegmentCount": len(transcripts),
        "outputRttm": str(Path(args.output_rttm).resolve()),
        "outputTranscripts": str(Path(args.output_transcripts).resolve()),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
