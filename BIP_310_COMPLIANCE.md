# BIP 310 Compliance Implementation

This document describes the changes made to ensure full compliance with BIP 310 (Stratum protocol extensions for version rolling).

## Overview

BIP 310 defines a negotiation protocol between mining clients and pools to enable version rolling (ASICBoost) in a standardized way. The key requirements are:

1. **mining.configure** method for capability negotiation
2. Version mask intersection between client and pool
3. Support for **mining.set_version_mask** notifications
4. Proper validation of rolled version bits

## Changes Made

### 1. Enhanced mining.configure Handler (lib/stratum.js)

The `handleConfigure` function now properly implements BIP 310:

- **Validates message format**: Ensures params[0] is an array of extension names
- **Parses extension parameters**: Reads client's requested version mask from params[1]
- **Performs mask intersection**: Calculates the intersection of pool and client masks
- **Counts available bits**: Ensures enough bits are available for the client's needs
- **Stores negotiated mask**: Saves the negotiated mask on the client object
- **Supports additional extensions**: Handles minimum-difficulty and subscribe-extranonce

### 2. Added mining.set_version_mask Support (lib/stratum.js)

- Added handler for `mining.set_version_mask` messages
- Added `setVersionMask` method to update client's mask and notify them

### 3. Version Validation with Negotiated Masks (lib/jobManager.js)

The share validation now uses the client's negotiated mask:

- **Per-client masks**: Uses the mask negotiated during mining.configure
- **Strict validation**: Rejects shares with version bits outside the negotiated mask
- **Debug logging**: Emits debug events for successful version rolling

### 4. Updated Share Submission Flow

- Modified `handleSubmit` to include the client's negotiated versionMask
- Updated `pool.js` to pass versionMask to jobManager.processShare
- Enhanced processShare to accept and use the client's negotiated mask

## Configuration

Pools can configure their allowed version mask in the pool options:

```javascript
const pool = Stratum.createPool({
    coin: {
        // ... other settings
        asicboost: true
    },
    versionMask: 0x1fffe000,  // Optional: defaults to standard ASICBoost mask
    // ... other options
});
```

## Version Rolling Validation

The implementation now strictly validates version rolling per BIP 310:

1. Calculates which bits were changed from the original version
2. Checks if ALL rolled bits are within the negotiated mask
3. Rejects shares with bits outside the mask (as required by BIP 310)
4. Logs successful version rolling for monitoring

## Backward Compatibility

- Clients that don't send mining.configure still work normally
- Version validation only applies when ASICBoost is enabled
- Default mask (0x1fffe000) is used if no negotiation occurs

## Testing

All existing tests pass with the new implementation. The changes maintain compatibility while adding proper BIP 310 support.

## Example Client Flow

1. Client connects and sends `mining.configure(["version-rolling"], {"version-rolling.mask": "1fffe000"})`
2. Pool responds with negotiated parameters: `{"version-rolling": true, "version-rolling.mask": "1fffe000", "version-rolling.min-bit-count": 16}`
3. Client submits shares with version parameter using only the negotiated bits
4. Pool validates that rolled bits are within the negotiated mask

This implementation ensures full compliance with BIP 310 while maintaining compatibility with existing miners.