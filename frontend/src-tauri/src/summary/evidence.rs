use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct SummaryEvidenceLedger {
    pub title: String,
    pub narrative_summary: String,
    #[serde(default)]
    pub items: Vec<EvidenceItem>,
}

impl SummaryEvidenceLedger {
    pub(crate) fn render_markdown(&self) -> String {
        let title = self.title.trim();
        let title = if title.is_empty() {
            "Meeting Summary"
        } else {
            title
        };

        let mut markdown = String::new();
        markdown.push_str("# ");
        markdown.push_str(title);
        markdown.push_str("\n\n");
        markdown.push_str("**Summary**\n\n");
        markdown.push_str(non_empty_or_none(&self.narrative_summary));

        push_timeline_section(&mut markdown, &self.items);
        push_items_section(
            &mut markdown,
            "Decisions",
            "| **Decision** | **Owner** | **Rationale** | **Reference** |\n| --- | --- | --- | --- |",
            "| None noted in this section. | TBD | TBD | TBD |",
            self.items
                .iter()
                .filter(|item| item.status == EvidenceStatus::FinalDecision),
            render_decision_row,
        );
        push_items_section(
            &mut markdown,
            "Action Items",
            "| **Owner** | **Action** | **Due** | **Priority** | **Reference** |\n| --- | --- | --- | --- | --- |",
            "| TBD | None noted in this section. | TBD | TBD | TBD |",
            self.items
                .iter()
                .filter(|item| item.status == EvidenceStatus::ActionItem),
            render_action_row,
        );
        push_items_section(
            &mut markdown,
            "Follow-ups",
            "| **Owner** | **Follow-up** | **Status** | **Context** | **Reference** |\n| --- | --- | --- | --- | --- |",
            "| TBD | None noted in this section. | TBD | TBD | TBD |",
            self.items.iter().filter(|item| {
                matches!(
                    item.status,
                    EvidenceStatus::ConditionalAction
                        | EvidenceStatus::Proposal
                        | EvidenceStatus::DeferredPrivate
                        | EvidenceStatus::UnresolvedQuestion
                )
            }),
            render_follow_up_row,
        );
        push_items_section(
            &mut markdown,
            "Risks / Blockers",
            "| **Risk** | **Owner** | **Context** | **Reference** |\n| --- | --- | --- | --- |",
            "| None noted in this section. | TBD | TBD | TBD |",
            self.items
                .iter()
                .filter(|item| item.status == EvidenceStatus::Risk),
            render_risk_row,
        );
        push_items_section(
            &mut markdown,
            "Disagreements / Alternate Readings",
            "| **Topic** | **Disagreement** | **Status** | **Reference** |\n| --- | --- | --- | --- |",
            "| None noted in this section. | None noted in this section. | TBD | TBD |",
            self.items
                .iter()
                .filter(|item| item.status == EvidenceStatus::Disagreement),
            render_disagreement_row,
        );
        push_discussion_notes(&mut markdown, &self.items);

        markdown
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct EvidenceItem {
    pub id: String,
    pub topic: String,
    pub status: EvidenceStatus,
    pub claim: String,
    pub owner: Option<String>,
    pub due: Option<String>,
    pub priority: Option<String>,
    pub rationale: Option<String>,
    pub superseded_by: Option<String>,
    #[serde(default)]
    pub evidence: Vec<EvidenceRef>,
    pub confidence: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum EvidenceStatus {
    FinalDecision,
    ActionItem,
    ConditionalAction,
    Proposal,
    Superseded,
    RejectedOrSuperseded,
    DeferredPrivate,
    Risk,
    Disagreement,
    UnresolvedQuestion,
    BackgroundDiscussion,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct EvidenceRef {
    pub timestamp: String,
    pub quote: Option<String>,
}

pub(crate) fn build_evidence_extraction_system_prompt() -> &'static str {
    r#"You are an expert meeting analyst. Extract a structured evidence ledger from the transcript before any final summary is written.

Return only valid JSON. Do not include Markdown or commentary.

Conflict resolution rules:
- Classify every meaningful claim as one of: final_decision, action_item, conditional_action, proposal, superseded, rejected_or_superseded, deferred_private, risk, disagreement, unresolved_question, background_discussion.
- Do not mark an item as final_decision unless the transcript shows explicit agreement and no later contradiction.
- If an early claim is later changed, preserve the early claim as superseded/rejected_or_superseded and connect it with superseded_by when possible.
- If a topic is deferred to later/private discussion, use deferred_private or unresolved_question, not final_decision.
- Preserve timestamp evidence for every item using the transcript's [MM:SS] prefixes.
- Capture concrete workflows, causal chains, risks, objections, product feedback, pilot pipeline details, and action-item execution details.
- Use null for unknown optional fields and [] for no evidence.

Schema:
{
  "title": "short title",
  "narrative_summary": "2-4 detailed paragraphs in English that separate final outcomes from tentative/deferred discussion",
  "items": [
    {
      "id": "stable kebab-case id",
      "topic": "topic label",
      "status": "final_decision|action_item|conditional_action|proposal|superseded|rejected_or_superseded|deferred_private|risk|disagreement|unresolved_question|background_discussion",
      "claim": "specific claim, decision, action, risk, disagreement, or follow-up",
      "owner": "person/team or null",
      "due": "due date/time or null",
      "priority": "priority or null",
      "rationale": "why it mattered, objection, condition, or context, or null",
      "superseded_by": "id of later item or null",
      "evidence": [{"timestamp": "[MM:SS]", "quote": "short supporting quote or null"}],
      "confidence": "high|medium|low"
    }
  ]
}"#
}

pub(crate) fn build_evidence_extraction_user_prompt(
    transcript_or_chunk_summary: &str,
    custom_prompt: &str,
) -> String {
    let mut prompt = String::new();
    prompt.push_str("<transcript_chunks>\n");
    prompt.push_str(transcript_or_chunk_summary);
    prompt.push_str("\n</transcript_chunks>");

    if !custom_prompt.trim().is_empty() {
        prompt.push_str("\n\n<user_context>\n");
        prompt.push_str(custom_prompt);
        prompt.push_str("\n</user_context>");
    }

    prompt
}

pub(crate) fn parse_evidence_json(raw: &str) -> Result<SummaryEvidenceLedger, String> {
    let candidate = extract_json_candidate(raw)?;
    serde_json::from_str::<SummaryEvidenceLedger>(&candidate)
        .map_err(|e| format!("Failed to parse evidence JSON: {e}"))
}

fn extract_json_candidate(raw: &str) -> Result<String, String> {
    let tagged = extract_tag(raw, "evidence_json").unwrap_or(raw);
    let fenced = strip_json_fence(tagged.trim());
    if fenced.trim_start().starts_with('{') {
        return Ok(fenced.trim().to_string());
    }

    let start = fenced
        .find('{')
        .ok_or_else(|| "Evidence response did not contain a JSON object".to_string())?;
    let end = fenced
        .rfind('}')
        .ok_or_else(|| "Evidence response did not contain a complete JSON object".to_string())?;

    if start > end {
        return Err("Evidence response JSON bounds were invalid".to_string());
    }

    Ok(fenced[start..=end].trim().to_string())
}

fn extract_tag<'a>(raw: &'a str, tag: &str) -> Option<&'a str> {
    let start_tag = format!("<{tag}>");
    let end_tag = format!("</{tag}>");
    let start = raw.find(&start_tag)? + start_tag.len();
    let end = raw[start..].find(&end_tag)? + start;
    Some(&raw[start..end])
}

fn strip_json_fence(value: &str) -> &str {
    let trimmed = value.trim();
    for prefix in ["```json", "```JSON", "```"] {
        if trimmed.starts_with(prefix) && trimmed.ends_with("```") {
            return trimmed[prefix.len()..trimmed.len() - 3].trim();
        }
    }
    trimmed
}

fn push_timeline_section(markdown: &mut String, items: &[EvidenceItem]) {
    markdown.push_str("\n\n**Timeline**\n\n");
    markdown
        .push_str("| **Time** | **Topic** | **Status** | **What Happened** | **Reference** |\n");
    markdown.push_str("| --- | --- | --- | --- | --- |\n");

    if items.is_empty() {
        markdown.push_str("| TBD | None noted | None | None noted in this section. | TBD |\n");
        return;
    }

    for item in items {
        let reference = primary_reference(item);
        markdown.push_str(&format!(
            "| {} | {} | {} | {} | {} |\n",
            escape_table_cell(reference.timestamp.as_deref().unwrap_or("TBD")),
            escape_table_cell(&item.topic),
            escape_table_cell(item.status.label()),
            escape_table_cell(&item.claim),
            escape_table_cell(reference.display.as_deref().unwrap_or("TBD")),
        ));
    }
}

fn push_items_section<'a, I, F>(
    markdown: &mut String,
    title: &str,
    header: &str,
    empty_row: &str,
    items: I,
    render_row: F,
) where
    I: Iterator<Item = &'a EvidenceItem>,
    F: Fn(&EvidenceItem) -> String,
{
    markdown.push_str("\n\n**");
    markdown.push_str(title);
    markdown.push_str("**\n\n");
    markdown.push_str(header);
    markdown.push('\n');

    let mut count = 0;
    for item in items {
        markdown.push_str(&render_row(item));
        markdown.push('\n');
        count += 1;
    }

    if count == 0 {
        markdown.push_str(empty_row);
        markdown.push('\n');
    }
}

fn render_decision_row(item: &EvidenceItem) -> String {
    let reference = primary_reference(item);
    format!(
        "| {} | {} | {} | {} |",
        escape_table_cell(&item.claim),
        escape_table_cell(optional_or_tbd(item.owner.as_deref())),
        escape_table_cell(optional_or_tbd(item.rationale.as_deref())),
        escape_table_cell(reference.display.as_deref().unwrap_or("TBD")),
    )
}

fn render_action_row(item: &EvidenceItem) -> String {
    let reference = primary_reference(item);
    format!(
        "| {} | {} | {} | {} | {} |",
        escape_table_cell(optional_or_tbd(item.owner.as_deref())),
        escape_table_cell(&item.claim),
        escape_table_cell(optional_or_tbd(item.due.as_deref())),
        escape_table_cell(optional_or_tbd(item.priority.as_deref())),
        escape_table_cell(reference.display.as_deref().unwrap_or("TBD")),
    )
}

fn render_follow_up_row(item: &EvidenceItem) -> String {
    let reference = primary_reference(item);
    format!(
        "| {} | {} | {} | {} | {} |",
        escape_table_cell(optional_or_tbd(item.owner.as_deref())),
        escape_table_cell(&item.claim),
        escape_table_cell(item.status.label()),
        escape_table_cell(optional_or_tbd(item.rationale.as_deref())),
        escape_table_cell(reference.display.as_deref().unwrap_or("TBD")),
    )
}

fn render_risk_row(item: &EvidenceItem) -> String {
    let reference = primary_reference(item);
    format!(
        "| {} | {} | {} | {} |",
        escape_table_cell(&item.claim),
        escape_table_cell(optional_or_tbd(item.owner.as_deref())),
        escape_table_cell(optional_or_tbd(item.rationale.as_deref())),
        escape_table_cell(reference.display.as_deref().unwrap_or("TBD")),
    )
}

fn render_disagreement_row(item: &EvidenceItem) -> String {
    let reference = primary_reference(item);
    format!(
        "| {} | {} | {} | {} |",
        escape_table_cell(&item.topic),
        escape_table_cell(&item.claim),
        escape_table_cell(item.status.label()),
        escape_table_cell(reference.display.as_deref().unwrap_or("TBD")),
    )
}

fn push_discussion_notes(markdown: &mut String, items: &[EvidenceItem]) {
    let discussion_items = items
        .iter()
        .filter(|item| {
            matches!(
                item.status,
                EvidenceStatus::BackgroundDiscussion
                    | EvidenceStatus::Superseded
                    | EvidenceStatus::RejectedOrSuperseded
            )
        })
        .collect::<Vec<_>>();

    markdown.push_str("\n\n**Discussion Notes**\n\n");
    if discussion_items.is_empty() {
        markdown.push_str("None noted in this section.");
        return;
    }

    for item in discussion_items {
        let reference = primary_reference(item);
        markdown.push_str("- ");
        markdown.push_str(&item.claim);
        markdown.push_str(" (");
        markdown.push_str(item.status.label());
        if let Some(display) = reference.display {
            markdown.push_str(", ");
            markdown.push_str(&display);
        }
        markdown.push_str(")\n");
    }
}

impl EvidenceStatus {
    fn label(&self) -> &'static str {
        match self {
            EvidenceStatus::FinalDecision => "Final decision",
            EvidenceStatus::ActionItem => "Action item",
            EvidenceStatus::ConditionalAction => "Conditional action",
            EvidenceStatus::Proposal => "Proposal",
            EvidenceStatus::Superseded => "Superseded",
            EvidenceStatus::RejectedOrSuperseded => "Rejected or superseded",
            EvidenceStatus::DeferredPrivate => "Deferred/private",
            EvidenceStatus::Risk => "Risk",
            EvidenceStatus::Disagreement => "Disagreement",
            EvidenceStatus::UnresolvedQuestion => "Unresolved question",
            EvidenceStatus::BackgroundDiscussion => "Background discussion",
        }
    }
}

struct PrimaryReference {
    timestamp: Option<String>,
    display: Option<String>,
}

fn primary_reference(item: &EvidenceItem) -> PrimaryReference {
    let Some(reference) = item.evidence.first() else {
        return PrimaryReference {
            timestamp: None,
            display: None,
        };
    };

    let timestamp = reference.timestamp.trim();
    let timestamp = if timestamp.is_empty() {
        None
    } else {
        Some(timestamp.to_string())
    };
    let quote = reference
        .quote
        .as_deref()
        .map(str::trim)
        .filter(|q| !q.is_empty());
    let display = match (timestamp.as_deref(), quote) {
        (Some(timestamp), Some(quote)) => Some(format!("{timestamp} {quote}")),
        (Some(timestamp), None) => Some(timestamp.to_string()),
        (None, Some(quote)) => Some(quote.to_string()),
        (None, None) => None,
    };

    PrimaryReference { timestamp, display }
}

fn non_empty_or_none(value: &str) -> &str {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        "None noted in this section."
    } else {
        trimmed
    }
}

fn optional_or_tbd(value: Option<&str>) -> &str {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("TBD")
}

fn escape_table_cell(value: &str) -> String {
    value.replace('|', "\\|").replace('\n', " ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_ledger_resolves_superseded_proposal_out_of_decisions() {
        let ledger = SummaryEvidenceLedger {
            title: "Launch Planning".to_string(),
            narrative_summary: "The team moved from an initial Friday launch idea to a Monday launch after support coverage concerns.".to_string(),
            items: vec![
                EvidenceItem {
                    id: "proposal-friday".to_string(),
                    topic: "Launch date".to_string(),
                    status: EvidenceStatus::Superseded,
                    claim: "Ship the launch on Friday.".to_string(),
                    owner: Some("Alex".to_string()),
                    due: None,
                    priority: None,
                    rationale: Some("Initial preference before support coverage was discussed.".to_string()),
                    superseded_by: Some("decision-monday".to_string()),
                    evidence: vec![EvidenceRef {
                        timestamp: "[02:00]".to_string(),
                        quote: Some("Maybe we ship Friday.".to_string()),
                    }],
                    confidence: Some("high".to_string()),
                },
                EvidenceItem {
                    id: "decision-monday".to_string(),
                    topic: "Launch date".to_string(),
                    status: EvidenceStatus::FinalDecision,
                    claim: "Move the launch to Monday.".to_string(),
                    owner: Some("Alex".to_string()),
                    due: Some("Monday".to_string()),
                    priority: Some("High".to_string()),
                    rationale: Some("Support coverage is better after the weekend.".to_string()),
                    superseded_by: None,
                    evidence: vec![EvidenceRef {
                        timestamp: "[31:00]".to_string(),
                        quote: Some("Actually, forget Friday. We are doing Monday.".to_string()),
                    }],
                    confidence: Some("high".to_string()),
                },
            ],
        };

        let markdown = ledger.render_markdown();

        assert!(markdown.contains("# Launch Planning"));
        assert!(markdown.contains("Move the launch to Monday"));
        assert!(markdown.contains("[31:00]"));
        assert!(markdown.contains("Superseded"));
        assert!(markdown.contains("Ship the launch on Friday"));

        let decisions = section_text(&markdown, "**Decisions**");
        assert!(decisions.contains("Move the launch to Monday"));
        assert!(!decisions.contains("Ship the launch on Friday"));
    }

    #[test]
    fn parse_evidence_json_accepts_tagged_and_fenced_json() {
        let raw = r#"
noise
<evidence_json>
```json
{
  "title": "Conflict Test",
  "narrative_summary": "The team resolved one conflict.",
  "items": [
    {
      "id": "a",
      "topic": "Direction",
      "status": "proposal",
      "claim": "Try skit videos.",
      "owner": null,
      "due": null,
      "priority": null,
      "rationale": null,
      "superseded_by": "b",
      "evidence": [{"timestamp": "[01:00]", "quote": "Maybe skits work."}],
      "confidence": "medium"
    }
  ]
}
```
</evidence_json>
"#;

        let ledger = parse_evidence_json(raw).expect("tagged fenced JSON should parse");

        assert_eq!(ledger.title, "Conflict Test");
        assert_eq!(ledger.items[0].status, EvidenceStatus::Proposal);
        assert_eq!(ledger.items[0].evidence[0].timestamp, "[01:00]");
    }

    #[test]
    fn evidence_prompt_requires_conflict_statuses_and_timestamps() {
        let system = build_evidence_extraction_system_prompt();

        assert!(system.contains("final_decision"));
        assert!(system.contains("superseded"));
        assert!(system.contains("rejected_or_superseded"));
        assert!(system.contains("deferred_private"));
        assert!(system.contains("no later contradiction"));
        assert!(system.contains("[MM:SS]"));
    }

    fn section_text<'a>(markdown: &'a str, heading: &str) -> &'a str {
        let start = markdown.find(heading).expect("heading exists");
        let rest = &markdown[start + heading.len()..];
        match rest.find("\n\n**") {
            Some(end) => &rest[..end],
            None => rest,
        }
    }
}
