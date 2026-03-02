# Design Document Template

Use this template when writing findings to `.party/findings/design.md`.

## Design: [component/feature]

### Context
- **Problem**: [from analysis findings]
- **Current State**: [how it works now]
- **Desired State**: [what we want to achieve]

### Options Evaluated

#### Option A: [name]
- **Description**: [approach summary]
- **Pros**: [advantages]
- **Cons**: [disadvantages]
- **Effort**: LOW | MEDIUM | HIGH
- **Risk**: LOW | MEDIUM | HIGH

#### Option B: [name]
<!-- repeat pattern -->

### Recommended Approach
- **Selected**: Option [X]
- **Rationale**: [why this option was chosen]
- **Key Tradeoffs**: [what we're accepting]

### Detailed Design

#### Affected Files
| File | Change Type | Description |
|------|-------------|-------------|
| `path/to/file` | modify/create/delete | what changes |

#### Interface Changes
```
// API/interface changes if applicable
```

#### Data Model Changes
```
// Schema/model changes if applicable
```

### Acceptance Criteria
- [ ] [measurable criterion 1]
- [ ] [measurable criterion 2]
- [ ] [test criterion]

### Risks & Mitigations
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| | LOW/MED/HIGH | LOW/MED/HIGH | |

### Rollback Strategy
- [steps to revert if issues arise]

### Dependencies
- [external dependencies, blocked-by items]
