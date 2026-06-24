const PAGE_WIDTH: f32 = 612.0;
const PAGE_HEIGHT: f32 = 792.0;
const LEFT_MARGIN: f32 = 54.0;
const TOP_MARGIN: f32 = 742.0;
const LINE_HEIGHT: f32 = 15.0;
const MAX_LINES_PER_PAGE: usize = 45;
const MAX_LINE_CHARS: usize = 92;

pub fn render_markdown_pdf(markdown: &str) -> Result<Vec<u8>, String> {
    let lines = markdown_to_lines(markdown);
    if lines.is_empty() {
        return Err("Cannot export an empty PDF".to_string());
    }

    let pages: Vec<Vec<String>> = lines
        .chunks(MAX_LINES_PER_PAGE)
        .map(|chunk| chunk.to_vec())
        .collect();

    Ok(build_pdf_document(&pages))
}

fn markdown_to_lines(markdown: &str) -> Vec<String> {
    let mut lines = Vec::new();
    for raw_line in markdown.lines() {
        let line = normalise_markdown_line(raw_line);
        if line.is_empty() {
            lines.push(String::new());
            continue;
        }

        for wrapped in wrap_line(&line, MAX_LINE_CHARS) {
            lines.push(wrapped);
        }
    }

    while lines.last().is_some_and(|line| line.is_empty()) {
        lines.pop();
    }

    lines
}

fn normalise_markdown_line(line: &str) -> String {
    let trimmed = line.trim();
    if trimmed.starts_with('|') && trimmed.chars().all(|c| matches!(c, '|' | '-' | ':' | ' ')) {
        return String::new();
    }

    let without_heading = trimmed
        .strip_prefix("### ")
        .or_else(|| trimmed.strip_prefix("## "))
        .or_else(|| trimmed.strip_prefix("# "))
        .unwrap_or(trimmed);

    without_heading
        .strip_prefix("- ")
        .map(|value| format!("- {value}"))
        .unwrap_or_else(|| without_heading.to_string())
}

fn wrap_line(line: &str, max_chars: usize) -> Vec<String> {
    if line.chars().count() <= max_chars {
        return vec![line.to_string()];
    }

    let mut wrapped = Vec::new();
    let mut current = String::new();

    for word in line.split_whitespace() {
        let next_len =
            current.chars().count() + if current.is_empty() { 0 } else { 1 } + word.chars().count();
        if next_len > max_chars && !current.is_empty() {
            wrapped.push(current);
            current = word.to_string();
        } else {
            if !current.is_empty() {
                current.push(' ');
            }
            current.push_str(word);
        }
    }

    if !current.is_empty() {
        wrapped.push(current);
    }

    wrapped
}

fn build_pdf_document(pages: &[Vec<String>]) -> Vec<u8> {
    let mut objects = Vec::new();
    let page_ids: Vec<usize> = (0..pages.len()).map(|index| 4 + index * 2).collect();
    let kid_refs = page_ids
        .iter()
        .map(|id| format!("{id} 0 R"))
        .collect::<Vec<_>>()
        .join(" ");

    objects.push((1, "<< /Type /Catalog /Pages 2 0 R >>".to_string()));
    objects.push((
        2,
        format!(
            "<< /Type /Pages /Kids [{kid_refs}] /Count {} >>",
            pages.len()
        ),
    ));
    objects.push((
        3,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_string(),
    ));

    for (index, page_lines) in pages.iter().enumerate() {
        let page_id = 4 + index * 2;
        let content_id = page_id + 1;
        let stream = build_page_stream(page_lines);

        objects.push((
            page_id,
            format!(
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_WIDTH:.0} {PAGE_HEIGHT:.0}] /Resources << /Font << /F1 3 0 R >> >> /Contents {content_id} 0 R >>"
            ),
        ));
        objects.push((
            content_id,
            format!(
                "<< /Length {} >>\nstream\n{}endstream",
                stream.as_bytes().len(),
                stream
            ),
        ));
    }

    let mut pdf = String::from("%PDF-1.4\n");
    let mut offsets = vec![0usize];

    for (id, body) in &objects {
        offsets.push(pdf.len());
        pdf.push_str(&format!("{id} 0 obj\n{body}\nendobj\n"));
    }

    let xref_offset = pdf.len();
    pdf.push_str(&format!("xref\n0 {}\n", objects.len() + 1));
    pdf.push_str("0000000000 65535 f \n");
    for offset in offsets.iter().skip(1) {
        pdf.push_str(&format!("{offset:010} 00000 n \n"));
    }
    pdf.push_str(&format!(
        "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n",
        objects.len() + 1
    ));

    pdf.into_bytes()
}

fn build_page_stream(lines: &[String]) -> String {
    let mut stream = String::new();
    stream.push_str("BT\n/F1 11 Tf\n");
    stream.push_str(&format!("{LEFT_MARGIN:.0} {TOP_MARGIN:.0} Td\n"));

    for (index, line) in lines.iter().enumerate() {
        if index > 0 {
            stream.push_str(&format!("0 -{LINE_HEIGHT:.0} Td\n"));
        }

        if line.is_empty() {
            continue;
        }

        stream.push('(');
        stream.push_str(&escape_pdf_text(line));
        stream.push_str(") Tj\n");
    }

    stream.push_str("ET\n");
    stream
}

fn escape_pdf_text(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace('(', "\\(")
        .replace(')', "\\)")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_markdown_as_pdf_bytes_with_escaped_text() {
        let markdown = "# Roadmap Sync\n\n## Metadata\n\n| Field | Value |\n| --- | --- |\n| Title | Roadmap (Q3) |\n\n## Summary\n\nShip the export flow.";

        let pdf = render_markdown_pdf(markdown).expect("PDF should render");
        let text = String::from_utf8_lossy(&pdf);

        assert!(text.starts_with("%PDF-1.4"));
        assert!(text.contains("Roadmap Sync"));
        assert!(text.contains("Roadmap \\(Q3\\)"));
        assert!(text.contains("Ship the export flow."));
        assert!(text.contains("%%EOF"));
    }
}
