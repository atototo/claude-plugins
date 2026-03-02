# Analysis Report Template

Use this template when writing findings to `.party/findings/analysis.md`.

## Analysis: [target description]

### Summary
<!-- 1-2 sentence assessment with severity level -->

### Scope
- **Target**: [file/module/system being analyzed]
- **Trigger**: [what initiated this analysis]
- **Time Range**: [if log/metric analysis, specify time window]

### Key Findings

#### Finding 1: [title]
- **Severity**: CRITICAL | HIGH | MEDIUM | LOW
- **Evidence**: `file:line` — description
- **Impact**: [quantified impact — count, percentage, affected scope]
- **Confidence**: HIGH | MEDIUM | LOW

#### Finding 2: [title]
<!-- repeat pattern -->

### Root Cause Analysis
- **Primary Cause**: [identified root cause with evidence chain]
- **Contributing Factors**: [secondary causes]
- **Evidence Chain**: [step-by-step trace from symptom to cause]

### Impact Assessment
| Metric | Value | Notes |
|--------|-------|-------|
| Error frequency | | |
| Affected files | | |
| Affected users/services | | |
| Estimated severity | | |

### Recommendations
1. **[Priority]** [action] — [expected outcome]
2. **[Priority]** [action] — [expected outcome]

### Data Sources
- [list of files, logs, metrics consulted]
