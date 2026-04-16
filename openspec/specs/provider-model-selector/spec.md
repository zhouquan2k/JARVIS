English | [Chinese](spec.zh-CN.md)

## MODIFIED Requirements

### Requirement: Show Provider Selector in chat interface
The chat interface MUST provide a visible Provider selection control; in normal chat mode it MUST provide a single Provider selector, and in compare mode it MUST provide separate Provider selectors for A and B. This requirement MUST apply to both the Web host and the extension full-window host.

#### Scenario: Compare mode renders two independent provider selectors in extension host
- **WHEN** the user enters the compare chat view in the extension full-window host
- **THEN** the system MUST render independent Provider selectors for Model A and Model B
- **AND** each Provider option set MUST come from the list of providers available in extension runtime mode.

### Requirement: Show a cascading Model selector based on Provider
Each Provider selector MUST bind a cascading Model selector; when one Provider group changes, that group's Model list MUST refresh independently and select the default model for that Provider without affecting the other group's selection state. This behavior MUST remain independent in the extension host as well.

#### Scenario: Changing Provider A updates only Model A options in extension compare mode
- **WHEN** the user switches the Provider for Model A in the extension compare view
- **THEN** the system MUST refresh only Model A's model list and automatically select the default model
- **AND** Model B's Provider and Model selection MUST remain unchanged.
