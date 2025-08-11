// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title PresentationRegistry
/// @notice Lightweight registry to store/verifiably reference verifiable presentations (VPs).
///         Presentations are holder-centric (holders register their own VP references).
contract PresentationRegistry {
    address public owner; // contract admin (can be issuer or operator)
    uint256 public presentationCount;

    struct Presentation {
        uint256 id;
        string holderDid;      // holder's DID (string)
        string mappingCID;     // optional IPFS CID for full VP JSON (or empty)
        bytes32 vpJwtHash;     // keccak256 hash of the compact VP JWT (0x0 if not provided)
        uint256 relatedCredentialId; // optional credential id (0 = none)
        uint256 createdAt;
        bool revoked;
    }

    // storage
    mapping(uint256 => Presentation) public presentations;
    mapping(string => uint256[]) private holderIndex; // holderDid => presentation ids

    // events
    event PresentationCreated(
        uint256 indexed id,
        string holderDid,
        string mappingCID,
        bytes32 vpJwtHash,
        uint256 relatedCredentialId,
        uint256 timestamp
    );

    event PresentationRevoked(uint256 indexed id, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice Create a presentation record.
    /// @dev This function does not attempt to verify that msg.sender "is" holderDid.
    ///      For stronger guarantees, require an on-chain DID ownership check or a holder signature (off-chain verify + on-chain proof).
    /// @param holderDid The DID for the holder (string form).
    /// @param mappingCID Optional IPFS CID for full presentation JSON (empty string if none).
    /// @param vpJwtHash keccak256 hash of compact VP JWT (0x0 if not provided).
    /// @param relatedCredentialId optional credential id (0 if not applicable).
    function createPresentation(
        string calldata holderDid,
        string calldata mappingCID,
        bytes32 vpJwtHash,
        uint256 relatedCredentialId
    ) external returns (uint256) {
        presentationCount++;
        uint256 id = presentationCount;

        presentations[id] = Presentation({
            id: id,
            holderDid: holderDid,
            mappingCID: mappingCID,
            vpJwtHash: vpJwtHash,
            relatedCredentialId: relatedCredentialId,
            createdAt: block.timestamp,
            revoked: false
        });

        holderIndex[holderDid].push(id);

        emit PresentationCreated(id, holderDid, mappingCID, vpJwtHash, relatedCredentialId, block.timestamp);
        return id;
    }

    /// @notice Revoke a presentation. Admin-only by default.
    /// @dev If you want holders to revoke their own presentations, add DID ownership checks:
    ///      - require a signature from the holder that can be validated on-chain (EIP-1271 / eth_sign scheme), OR
    ///      - store mapping from holderDid -> owner address at creation after verifying a signed message.
    function revokePresentation(uint256 id) external onlyOwner {
        Presentation storage p = presentations[id];
        require(p.id != 0, "presentation not found");
        require(!p.revoked, "already revoked");
        p.revoked = true;
        emit PresentationRevoked(id, block.timestamp);
    }

    /// @notice Get presentation IDs for a holder DID.
    function getPresentationsForHolder(string calldata holderDid) external view returns (uint256[] memory) {
        return holderIndex[holderDid];
    }

    /// @notice Read a presentation by id (public getter is also available via presentations mapping)
    function getPresentation(uint256 id) external view returns (
        uint256,
        string memory,
        string memory,
        bytes32,
        uint256,
        uint256,
        bool
    ) {
        Presentation memory p = presentations[id];
        return (p.id, p.holderDid, p.mappingCID, p.vpJwtHash, p.relatedCredentialId, p.createdAt, p.revoked);
    }

    /// @notice Admin: change owner
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero address");
        owner = newOwner;
    }
}
