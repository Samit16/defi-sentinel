# DeFiSentinel Result Format Specification

This document details the standardized communication interface between the Foundry Solidity test execution layer, the Python orchestrator parser, and the JSON reporting storage engine.

---

## 1. Solidity EVM Log Format (`SENTINEL_RESULT`)

Every attack simulation test suite extending `SentinelBase.t.sol` emits exactly one verdict log line to standard output via Foundry's `console.log`:

```text
SENTINEL_RESULT|<module>|<variant>|<status>|<profit_wei>|<note>
```

### Field Definitions

| Field | Type | Allowed Values | Description |
|---|---|---|---|
| `SENTINEL_RESULT` | String | Fixed Prefix | Identifies the line for regular expression extraction. |
| `<module>` | String | `reentrancy`, `oracle`, `flash_loan`, `governance` | The unique identifier of the attack class simulation. |
| `<variant>` | String | `vulnerable`, `protected` | The target smart contract implementation being tested. |
| `<status>` | String | `SUCCEEDED`, `FAILED` | Exploit outcome: `SUCCEEDED` means the attacker breached the contract and gained funds or privileges; `FAILED` means the defensive safeguard held and prevented the exploit. |
| `<profit_wei>` | Integer | `uint256` string | Net gain extracted by the attacker in wei ($10^{18}\text{ wei} = 1.0\text{ ETH / Token}$). `0` when blocked. |
| `<note>` | String | Free-form text | Human-readable explanation of how the attack succeeded or which specific guard blocked it. |

### Regex Pattern
```python
r"^SENTINEL_RESULT\|(?P<module>[a-zA-Z0-9_]+)\|(?P<variant>[a-zA-Z0-9_]+)\|(?P<status>SUCCEEDED|FAILED)\|(?P<profit_wei>\d+)\|(?P<note>[^\r\n]*)$"
```

---

## 2. Frozen JSON Report Schema (Block 5)

Generated reports are persisted to `reports/<report_id>.json` according to this frozen schema:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "DeFiSentinelSimulationReport",
  "type": "object",
  "required": [
    "report_id",
    "generated_at",
    "mode",
    "fork_block",
    "summary",
    "results"
  ],
  "properties": {
    "report_id": {
      "type": "string",
      "description": "Timestamp-derived identifier, e.g. '2026-10-11T14-02-33'"
    },
    "generated_at": {
      "type": "string",
      "format": "date-time",
      "description": "ISO-8601 generation timestamp with UTC timezone offset"
    },
    "mode": {
      "type": "string",
      "enum": ["local", "fork"],
      "description": "Execution environment mode"
    },
    "fork_block": {
      "type": ["integer", "null"],
      "description": "Specific block number forked from in fork mode, or null for local EVM"
    },
    "summary": {
      "type": "object",
      "required": ["total", "succeeded", "failed"],
      "properties": {
        "total": { "type": "integer" },
        "succeeded": { "type": "integer" },
        "failed": { "type": "integer" }
      }
    },
    "results": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "module",
          "variant",
          "status",
          "profit_eth",
          "note",
          "duration_s"
        ],
        "properties": {
          "module": { "type": "string" },
          "variant": { "type": "string", "enum": ["vulnerable", "protected"] },
          "status": { "type": "string", "enum": ["SUCCEEDED", "FAILED"] },
          "profit_eth": { "type": "number", "description": "Attacker profit normalized to ETH units" },
          "note": { "type": "string" },
          "duration_s": { "type": "number", "description": "Execution wall time in seconds" }
        }
      }
    }
  }
}
```

### Complete Report Example
```json
{
  "report_id": "2026-10-11T07-21-43",
  "generated_at": "2026-10-11T07:21:43.332879+00:00",
  "mode": "local",
  "fork_block": null,
  "summary": {
    "total": 8,
    "succeeded": 4,
    "failed": 4
  },
  "results": [
    {
      "module": "reentrancy",
      "variant": "vulnerable",
      "status": "SUCCEEDED",
      "profit_eth": 10.0,
      "note": "drained vault via reentrant withdraw",
      "duration_s": 0.15
    },
    {
      "module": "reentrancy",
      "variant": "protected",
      "status": "FAILED",
      "profit_eth": 0.0,
      "note": "reentrancy blocked: Initial withdraw failed",
      "duration_s": 0.15
    }
  ]
}
```
