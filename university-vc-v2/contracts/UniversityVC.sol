// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title UniversityVCV2 - DID-aware on-chain credential registry (lite access control)
/// @notice Stores minimal credential metadata (holderHash + IPFS CIDs) and provides DID-based lookup options.
contract UniversityVCV2 {
    // -- Lightweight access control --
    address public admin;
    mapping(address => bool) public issuers;

    // -- Credential counter --
    uint256 public credentialCount;

    struct Credential {
        uint256 id;
        bytes32 holderHash;     // keccak256(abi.encodePacked(holderDID, salt)) computed off-chain or keccak256(did) when using DID-based issuance
        string[] ipfsCIDs;      // versioned IPFS CIDs (index 0 = original)
        bytes32 credentialJWT;  // optional keccak256 hash of VC content
        uint256 issuedAt;
        uint256 expiresAt;      // 0 = no expiry
        bool valid;
        uint256 revokedAt;      // 0 = not revoked
        string revocationReason; // optional human-readable reason
    }

    // Storage
    mapping(uint256 => Credential) private credentials;
    mapping(bytes32 => uint256[]) private holderIndex; // holderHash => list of credential IDs

    // DID helpers
    // didIndex: keccak256(abi.encodePacked(did)) => list of credential IDs (issued using DID directly)
    mapping(bytes32 => uint256[]) private didIndex;
    // didToHolderHash: keccak256(did) => holderHash (salted) mapping (settable by issuer/admin)
    mapping(bytes32 => bytes32) public didToHolderHash;

    // Events
    event CredentialIssued(
        uint256 indexed id,
        bytes32 indexed holderHash,
        string cid,
        bytes32 credentialJWT,
        uint256 issuedAt,
        uint256 expiresAt
    );

    event CredentialCIDVersionAdded(uint256 indexed id, uint256 versionIndex, string cid);
    event CredentialRevoked(uint256 indexed id, uint256 revokedAt, string reason);
    event IssuerRoleGranted(address indexed account, address indexed granter);
    event IssuerRoleRevoked(address indexed account, address indexed revoker);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);
    event DIDBound(string did, bytes32 indexed holderHash);

    // ---------------------- Constructor ----------------------

    /// @notice Deploy with an explicit admin account. Admin initially becomes an issuer.
    constructor(address _admin) {
        require(_admin != address(0), "admin zero address");
        admin = _admin;
        issuers[_admin] = true;
    }

    // ---------------------- Modifiers ----------------------

    modifier onlyAdmin() {
        require(msg.sender == admin, "admin only");
        _;
    }

    modifier onlyIssuer() {
        require(issuers[msg.sender], "issuer only");
        _;
    }

    modifier onlyValidId(uint256 id) {
        require(id > 0 && id <= credentialCount, "Invalid credential id");
        _;
    }

    // ---------------------- Issuance ----------------------

    /// @notice Issue a new credential indexed by a pre-computed (salted) holderHash.
    /// This preserves privacy if holderHash is produced off-chain with a salt.
    function issueCredential(
        bytes32 holderHash,
        string calldata ipfsCID,
        bytes32 credentialJWT,
        uint256 expiresAt
    ) external onlyIssuer {
        require(holderHash != bytes32(0), "holderHash required");
        require(bytes(ipfsCID).length > 0, "cid required");

        credentialCount++;
        uint256 id = credentialCount;

        Credential storage c = credentials[id];
        c.id = id;
        c.holderHash = holderHash;
        c.ipfsCIDs.push(ipfsCID);
        c.credentialJWT = credentialJWT;
        c.issuedAt = block.timestamp;
        c.expiresAt = expiresAt;
        c.valid = true;

        holderIndex[holderHash].push(id);

        emit CredentialIssued(id, holderHash, ipfsCID, credentialJWT, block.timestamp, expiresAt);
    }

    /// @notice Issue a credential indexed directly by a DID string (useful when you want DID-based lookup).
    /// Note: using this decreases privacy because the DID-derived hash is deterministic (no salt).
    function issueCredentialWithDID(
        string calldata holderDID,
        string calldata ipfsCID,
        bytes32 credentialJWT,
        uint256 expiresAt
    ) external onlyIssuer {
        require(bytes(holderDID).length > 0, "holderDID required");
        require(bytes(ipfsCID).length > 0, "cid required");

        bytes32 didHash = keccak256(abi.encodePacked(holderDID));

        credentialCount++;
        uint256 id = credentialCount;

        Credential storage c = credentials[id];
        c.id = id;
        c.holderHash = didHash; // store did-derived hash in holderHash for convenience
        c.ipfsCIDs.push(ipfsCID);
        c.credentialJWT = credentialJWT;
        c.issuedAt = block.timestamp;
        c.expiresAt = expiresAt;
        c.valid = true;

        // index under both didIndex and holderIndex for compatibility
        didIndex[didHash].push(id);
        holderIndex[didHash].push(id);

        emit CredentialIssued(id, didHash, ipfsCID, credentialJWT, block.timestamp, expiresAt);
    }

    /// @notice Add a new CID version for an existing credential (keeps prior versions)
    function addCIDVersion(uint256 id, string calldata newCID) external onlyIssuer onlyValidId(id) {
        require(bytes(newCID).length > 0, "cid required");
        Credential storage c = credentials[id];
        c.ipfsCIDs.push(newCID);
        emit CredentialCIDVersionAdded(id, c.ipfsCIDs.length - 1, newCID);
    }

    // ---------------------- DID binding ----------------------

    /// @notice Bind a plaintext DID to a (salted) holderHash so DID-based lookups can resolve to salted entries.
    /// Only issuer/admin can bind - this ensures the mapping is maintained by trusted parties.
    function bindDIDToHolderHash(string calldata did, bytes32 holderHash) external onlyIssuer {
        require(bytes(did).length > 0, "did required");
        require(holderHash != bytes32(0), "holderHash required");
        bytes32 didHash = keccak256(abi.encodePacked(did));
        didToHolderHash[didHash] = holderHash;
        emit DIDBound(did, holderHash);
    }

    // ---------------------- Revocation & Metadata ----------------------

    /// @notice Revoke a credential with an optional reason
    function revokeCredential(uint256 id, string calldata reason) external onlyIssuer onlyValidId(id) {
        Credential storage c = credentials[id];
        require(c.valid, "Credential already revoked");
        c.valid = false;
        c.revokedAt = block.timestamp;
        c.revocationReason = reason;
        emit CredentialRevoked(id, c.revokedAt, reason);
    }

    /// @notice Restore a revoked credential (rare; requires issuer role)
    function restoreCredential(uint256 id) external onlyIssuer onlyValidId(id) {
        Credential storage c = credentials[id];
        require(!c.valid, "Credential not revoked");
        c.valid = true;
        c.revokedAt = 0;
        c.revocationReason = "";
    }

    // ---------------------- Access control helpers ----------------------

    /// @notice Grant issuer role to an account (admin only)
    function grantIssuer(address account) external onlyAdmin {
        require(account != address(0), "zero account");
        issuers[account] = true;
        emit IssuerRoleGranted(account, msg.sender);
    }

    /// @notice Revoke issuer role from an account (admin only)
    function revokeIssuer(address account) external onlyAdmin {
        require(account != address(0), "zero account");
        issuers[account] = false;
        emit IssuerRoleRevoked(account, msg.sender);
    }

    /// @notice Transfer admin control to a new account. New admin becomes an issuer by default.
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "new admin zero");
        address old = admin;
        admin = newAdmin;
        issuers[newAdmin] = true;
        emit AdminTransferred(old, newAdmin);
    }

    // ---------------------- Views / Verification ----------------------

    /// @notice Get list of credential IDs for a holderHash (computed off-chain)
    function getCredentialsForHolder(bytes32 holderHash) external view returns (uint256[] memory) {
        return holderIndex[holderHash];
    }

    /// @notice Get list of credential IDs for a plaintext DID.
    /// If a salted binding exists (didToHolderHash), that mapping is used (safer). Otherwise returns DID-indexed credentials.
    function getCredentialsForDID(string calldata did) external view returns (uint256[] memory) {
        bytes32 didHash = keccak256(abi.encodePacked(did));
        bytes32 mapped = didToHolderHash[didHash];
        if (mapped != bytes32(0)) {
            return holderIndex[mapped];
        }
        return didIndex[didHash];
    }

    /// @notice Get a summary for a credential id (latest CID returned)
    function getCredentialSummary(uint256 id)
        external
        view
        onlyValidId(id)
        returns (
            uint256,
            bytes32,
            string memory,
            bytes32,
            uint256,
            uint256,
            bool,
            uint256,
            string memory
        )
    {
        Credential storage c = credentials[id];
        string memory latestCID = c.ipfsCIDs.length > 0 ? c.ipfsCIDs[c.ipfsCIDs.length - 1] : "";
        return (c.id, c.holderHash, latestCID, c.credentialJWT, c.issuedAt, c.expiresAt, c.valid, c.revokedAt, c.revocationReason);
    }

    /// @notice Return all CID versions for a credential
    function getCIDVersions(uint256 id) external view onlyValidId(id) returns (string[] memory) {
        return credentials[id].ipfsCIDs;
    }

    /// @notice Verify that a given credential id matches a provided credential hash (and is valid / not expired)
    function verifyCredential(uint256 id, bytes32 credentialJWT) external view returns (bool) {
        if (id == 0 || id > credentialCount) return false;
        Credential storage c = credentials[id];
        if (!c.valid) return false;
        if (c.expiresAt != 0 && block.timestamp > c.expiresAt) return false;
        if (c.credentialJWT == bytes32(0)) return false; // stored hash required for comparison
        return (c.credentialJWT == credentialJWT);
    }

    /// @notice Verify holder ownership for a credential using the salted holderHash
    function verifyHolderForCredential(uint256 id, bytes32 holderHash) external view returns (bool) {
        if (id == 0 || id > credentialCount) return false;
        return (credentials[id].holderHash == holderHash);
    }

    // ---------------------- Admin utilities ----------------------

    /// @notice Emergency: allow admin to export raw credential struct (caution: exposes all fields)
    function getRawCredential(uint256 id)
        external
        view
        onlyAdmin
        onlyValidId(id)
        returns (
            uint256,
            bytes32,
            string[] memory,
            bytes32,
            uint256,
            uint256,
            bool,
            uint256,
            string memory
        )
    {
        Credential storage c = credentials[id];
        return (c.id, c.holderHash, c.ipfsCIDs, c.credentialJWT, c.issuedAt, c.expiresAt, c.valid, c.revokedAt, c.revocationReason);
    }
}
