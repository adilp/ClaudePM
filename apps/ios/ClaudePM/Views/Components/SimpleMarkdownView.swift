import SwiftUI

/// A simple native markdown renderer for iOS
/// Supports: headers, bold, italic, code blocks, inline code, lists, and links
struct SimpleMarkdownView: View {
    let content: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(parseBlocks().enumerated()), id: \.offset) { _, block in
                blockView(for: block)
            }
        }
    }

    // MARK: - Block Types

    private enum MarkdownBlock {
        case header(level: Int, text: String)
        case paragraph(text: String)
        case codeBlock(language: String?, code: String)
        case listItem(text: String, indent: Int)
        case divider
    }

    // MARK: - Parsing

    private func parseBlocks() -> [MarkdownBlock] {
        var blocks: [MarkdownBlock] = []
        let lines = content.components(separatedBy: "\n")
        var inCodeBlock = false
        var codeBlockLanguage: String?
        var codeBlockContent: [String] = []
        var currentParagraph: [String] = []

        for line in lines {
            // Code block handling
            if line.hasPrefix("```") {
                if inCodeBlock {
                    // End code block
                    blocks.append(.codeBlock(language: codeBlockLanguage, code: codeBlockContent.joined(separator: "\n")))
                    codeBlockContent = []
                    codeBlockLanguage = nil
                    inCodeBlock = false
                } else {
                    // Flush current paragraph
                    if !currentParagraph.isEmpty {
                        blocks.append(.paragraph(text: currentParagraph.joined(separator: " ")))
                        currentParagraph = []
                    }
                    // Start code block
                    inCodeBlock = true
                    let lang = String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces)
                    codeBlockLanguage = lang.isEmpty ? nil : lang
                }
                continue
            }

            if inCodeBlock {
                codeBlockContent.append(line)
                continue
            }

            // Empty line - flush paragraph
            if line.trimmingCharacters(in: .whitespaces).isEmpty {
                if !currentParagraph.isEmpty {
                    blocks.append(.paragraph(text: currentParagraph.joined(separator: " ")))
                    currentParagraph = []
                }
                continue
            }

            // Divider
            if line.trimmingCharacters(in: .whitespaces).hasPrefix("---") ||
               line.trimmingCharacters(in: .whitespaces).hasPrefix("***") {
                if !currentParagraph.isEmpty {
                    blocks.append(.paragraph(text: currentParagraph.joined(separator: " ")))
                    currentParagraph = []
                }
                blocks.append(.divider)
                continue
            }

            // Headers
            if line.hasPrefix("######") {
                if !currentParagraph.isEmpty {
                    blocks.append(.paragraph(text: currentParagraph.joined(separator: " ")))
                    currentParagraph = []
                }
                blocks.append(.header(level: 6, text: String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)))
                continue
            } else if line.hasPrefix("#####") {
                if !currentParagraph.isEmpty {
                    blocks.append(.paragraph(text: currentParagraph.joined(separator: " ")))
                    currentParagraph = []
                }
                blocks.append(.header(level: 5, text: String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)))
                continue
            } else if line.hasPrefix("####") {
                if !currentParagraph.isEmpty {
                    blocks.append(.paragraph(text: currentParagraph.joined(separator: " ")))
                    currentParagraph = []
                }
                blocks.append(.header(level: 4, text: String(line.dropFirst(4)).trimmingCharacters(in: .whitespaces)))
                continue
            } else if line.hasPrefix("###") {
                if !currentParagraph.isEmpty {
                    blocks.append(.paragraph(text: currentParagraph.joined(separator: " ")))
                    currentParagraph = []
                }
                blocks.append(.header(level: 3, text: String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces)))
                continue
            } else if line.hasPrefix("##") {
                if !currentParagraph.isEmpty {
                    blocks.append(.paragraph(text: currentParagraph.joined(separator: " ")))
                    currentParagraph = []
                }
                blocks.append(.header(level: 2, text: String(line.dropFirst(2)).trimmingCharacters(in: .whitespaces)))
                continue
            } else if line.hasPrefix("#") {
                if !currentParagraph.isEmpty {
                    blocks.append(.paragraph(text: currentParagraph.joined(separator: " ")))
                    currentParagraph = []
                }
                blocks.append(.header(level: 1, text: String(line.dropFirst(1)).trimmingCharacters(in: .whitespaces)))
                continue
            }

            // List items
            let trimmedLine = line.trimmingCharacters(in: .whitespaces)
            if trimmedLine.hasPrefix("- ") || trimmedLine.hasPrefix("* ") || trimmedLine.hasPrefix("+ ") {
                if !currentParagraph.isEmpty {
                    blocks.append(.paragraph(text: currentParagraph.joined(separator: " ")))
                    currentParagraph = []
                }
                let indent = line.prefix(while: { $0 == " " || $0 == "\t" }).count / 2
                let text = String(trimmedLine.dropFirst(2))
                blocks.append(.listItem(text: text, indent: indent))
                continue
            }

            // Numbered list items
            if let match = trimmedLine.range(of: #"^\d+\.\s+"#, options: .regularExpression) {
                if !currentParagraph.isEmpty {
                    blocks.append(.paragraph(text: currentParagraph.joined(separator: " ")))
                    currentParagraph = []
                }
                let text = String(trimmedLine[match.upperBound...])
                blocks.append(.listItem(text: text, indent: 0))
                continue
            }

            // Regular text - add to paragraph
            currentParagraph.append(line)
        }

        // Flush remaining content
        if inCodeBlock {
            blocks.append(.codeBlock(language: codeBlockLanguage, code: codeBlockContent.joined(separator: "\n")))
        } else if !currentParagraph.isEmpty {
            blocks.append(.paragraph(text: currentParagraph.joined(separator: " ")))
        }

        return blocks
    }

    // MARK: - Block Views

    @ViewBuilder
    private func blockView(for block: MarkdownBlock) -> some View {
        switch block {
        case .header(let level, let text):
            headerView(level: level, text: text)

        case .paragraph(let text):
            inlineFormattedText(text)
                .fixedSize(horizontal: false, vertical: true)

        case .codeBlock(let language, let code):
            codeBlockView(language: language, code: code)

        case .listItem(let text, let indent):
            listItemView(text: text, indent: indent)

        case .divider:
            Divider()
                .padding(.vertical, 4)
        }
    }

    private func headerView(level: Int, text: String) -> some View {
        let font: Font
        let weight: Font.Weight

        switch level {
        case 1:
            font = .title
            weight = .bold
        case 2:
            font = .title2
            weight = .bold
        case 3:
            font = .title3
            weight = .semibold
        case 4:
            font = .headline
            weight = .semibold
        case 5:
            font = .subheadline
            weight = .semibold
        default:
            font = .callout
            weight = .medium
        }

        return Text(text)
            .font(font)
            .fontWeight(weight)
            .padding(.top, level <= 2 ? 8 : 4)
    }

    private func codeBlockView(language: String?, code: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if let lang = language, !lang.isEmpty {
                Text(lang)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                Text(code)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.primary)
                    .padding(10)
            }
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }

    private func listItemView(text: String, indent: Int) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text("•")
                .foregroundStyle(.secondary)
            inlineFormattedText(text)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.leading, CGFloat(indent) * 16)
    }

    // MARK: - Inline Formatting

    private func inlineFormattedText(_ text: String) -> Text {
        parseInlineElements(text)
    }

    private func parseInlineElements(_ text: String) -> Text {
        var result = Text("")
        var remaining = text

        while !remaining.isEmpty {
            // Check for bold (**text**)
            if let boldRange = remaining.range(of: #"\*\*(.+?)\*\*"#, options: .regularExpression) {
                let beforeBold = String(remaining[..<boldRange.lowerBound])
                if !beforeBold.isEmpty {
                    result = result + parseInlineElements(beforeBold)
                }

                let boldMatch = String(remaining[boldRange])
                let boldText = String(boldMatch.dropFirst(2).dropLast(2))
                result = result + Text(boldText).bold()

                remaining = String(remaining[boldRange.upperBound...])
                continue
            }

            // Check for italic (*text* or _text_)
            if let italicRange = remaining.range(of: #"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)"#, options: .regularExpression) {
                let beforeItalic = String(remaining[..<italicRange.lowerBound])
                if !beforeItalic.isEmpty {
                    result = result + parseInlineElements(beforeItalic)
                }

                let italicMatch = String(remaining[italicRange])
                let italicText = String(italicMatch.dropFirst(1).dropLast(1))
                result = result + Text(italicText).italic()

                remaining = String(remaining[italicRange.upperBound...])
                continue
            }

            // Check for inline code (`code`)
            if let codeRange = remaining.range(of: #"`([^`]+)`"#, options: .regularExpression) {
                let beforeCode = String(remaining[..<codeRange.lowerBound])
                if !beforeCode.isEmpty {
                    result = result + Text(beforeCode)
                }

                let codeMatch = String(remaining[codeRange])
                let codeText = String(codeMatch.dropFirst(1).dropLast(1))
                result = result + Text(codeText)
                    .font(.system(.body, design: .monospaced))
                    .foregroundColor(.secondary)

                remaining = String(remaining[codeRange.upperBound...])
                continue
            }

            // Check for links [text](url)
            if let linkRange = remaining.range(of: #"\[([^\]]+)\]\(([^)]+)\)"#, options: .regularExpression) {
                let beforeLink = String(remaining[..<linkRange.lowerBound])
                if !beforeLink.isEmpty {
                    result = result + Text(beforeLink)
                }

                let linkMatch = String(remaining[linkRange])
                // Extract text between [ and ]
                if let textStart = linkMatch.firstIndex(of: "["),
                   let textEnd = linkMatch.firstIndex(of: "]") {
                    let linkText = String(linkMatch[linkMatch.index(after: textStart)..<textEnd])
                    result = result + Text(linkText).foregroundColor(.blue)
                }

                remaining = String(remaining[linkRange.upperBound...])
                continue
            }

            // No more formatting found, append the rest
            result = result + Text(remaining)
            break
        }

        return result
    }
}

// MARK: - Preview

#Preview {
    ScrollView {
        SimpleMarkdownView(content: """
        # Ticket Title

        ## Description

        This is a **bold** statement and this is *italic*.

        Here's some `inline code` for you.

        ### Features

        - First feature
        - Second feature with **bold**
        - Third feature

        ## Code Example

        ```swift
        func hello() {
            print("Hello, World!")
        }
        ```

        ---

        [Link to docs](https://example.com)

        Regular paragraph text that flows naturally across multiple lines and wraps appropriately.
        """)
        .padding()
    }
}
