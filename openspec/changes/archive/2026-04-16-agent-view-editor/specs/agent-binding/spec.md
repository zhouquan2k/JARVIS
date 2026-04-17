## ADDED Requirements

### Requirement: Agent binding MUST support default merge inheritance and explicit override
The system MUST support two `.agent.json` inheritance modes: `merge` and `override`. Missing `inheritance` MUST behave as `merge`. In `merge` mode, the resolved Agent MUST inherit parent configuration and merge system prompts in parent-to-child order. In `override` mode, the current `.agent.json` MUST truncate parent and default inheritance for that level and use only fields explicitly declared in the current config. Deeper child configs MAY still merge from that override result unless they also declare `override`.

#### Scenario: Merge parent and child agent prompts by default
- **WHEN** a parent directory and child directory both declare valid `.agent.json` files and the child does not declare `inheritance`
- **THEN** the resolved child Agent MUST include inherited parent configuration
- **AND** the effective prompt MUST concatenate the parent prompt before the child prompt

#### Scenario: Merge mode is equivalent to missing inheritance
- **WHEN** a child `.agent.json` explicitly declares `inheritance` as `merge`
- **THEN** the system MUST resolve the Agent using the same behavior as a missing `inheritance` field
- **AND** parent configuration MUST continue to be inherited

#### Scenario: Override truncates parent and default inheritance
- **WHEN** a child `.agent.json` declares `inheritance` as `override`
- **THEN** the resolved child Agent MUST use only fields explicitly declared in that child config
- **AND** the resolved child Agent MUST NOT inherit parent prompts, parent model selection, parent tools, parent skills, or default fallback tools

#### Scenario: Deeper children may merge from an override ancestor
- **WHEN** an override Agent has a deeper child Agent that uses default merge behavior
- **THEN** the deeper child Agent MUST merge with the override ancestor's resolved config
- **AND** the deeper child Agent MUST NOT recover configuration that was truncated by the override ancestor

#### Scenario: Reject invalid inheritance values
- **WHEN** `.agent.json` declares an `inheritance` value other than `merge` or `override`
- **THEN** the system MUST produce a diagnosable Agent configuration error
- **AND** the system MUST NOT silently fall back to merge or default Agent behavior

## REMOVED Requirements

### Requirement: Agent binding MUST support phase-one nearest-parent resolution with explicit override and fallback
**Reason**: The phase-one nearest-parent behavior explicitly excluded merge support, which conflicts with the desired default inheritance and prompt merging behavior.

**Migration**: Use the new `Agent binding MUST support default merge inheritance and explicit override` requirement. Existing configs without `inheritance` now use default merge. Configs that require independent behavior must declare `inheritance: "override"`.
