English | [Chinese](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Question index panel MUST render compact entries for visible user questions
The system MUST provide a dedicated question index panel for the current normal chat session and generate entries only from user questions that have not been soft-deleted. Each entry MUST show the first-line text summary of that question and truncate to a single line when the text overflows, rather than showing the full body or assistant reply content.

#### Scenario: Render compact question entries
- **WHEN** the active session contains multiple pairs of undeleted user questions and assistant replies
- **THEN** the system MUST render the corresponding question entries in the right-side question index panel in session order
- **AND** each entry MUST show only the first-line summary of the user question

### Requirement: Question index panel MUST support starred-only filtering and star state sync
The system MUST support switching between "all" and "starred only" filters in the question index panel, and it MUST keep the star state consistent between index items and the corresponding Q&A pairs in the main thread. After a user stars a question, the system MUST update both the visual state of the index item and the emphasis style of the matching Q&A pair in the main thread.

#### Scenario: Filter starred questions only
- **WHEN** the user switches the question index panel to "starred only"
- **THEN** the system MUST show only entries where `starred = true`
- **AND** when switching back to "all", it MUST restore all undeleted question entries

#### Scenario: Toggle star state from question index
- **WHEN** the user clicks the star action on a question entry
- **THEN** the system MUST update and persist the star state for the corresponding messages
- **AND** the matching Q&A pair in the main thread MUST reflect the starred visual state

### Requirement: Question index panel MUST soft-delete a question pair with inline confirmation
The system MUST provide inline delete confirmation on question entries rather than using a global modal. After the user confirms deletion, the system MUST mark both the user question and the assistant reply under the same `questionId` as soft-deleted, and it MUST filter that Q&A pair out of the index list and the visible main thread.

#### Scenario: Confirm inline delete for question pair
- **WHEN** the user triggers deletion on a question entry and confirms it
- **THEN** the system MUST mark both the user and assistant messages for the same `questionId` as `deleted = true`
- **AND** that Q&A pair MUST be removed from the question index list and the main thread's visible messages

### Requirement: Question index panel MUST synchronize navigation with main thread
The system MUST keep the question index panel and main thread in bidirectional navigation sync: when an index entry is clicked, the main thread MUST smoothly scroll to the corresponding Q&A pair; when the user scrolls the main thread, the panel MUST automatically highlight the question entry corresponding to the top of the current viewport.

#### Scenario: Scroll to question from index item
- **WHEN** the user clicks a question entry in the question index panel
- **THEN** the main thread MUST smoothly scroll to the message anchor for that question
- **AND** that entry MUST become the current highlighted item

#### Scenario: Highlight active question during thread scrolling
- **WHEN** the user scrolls up and down through a long conversation in the main thread
- **THEN** the system MUST update the panel highlight based on the visible question nearest to the top of the current viewport
- **AND** it MUST not require the user to manually refresh the index panel state
