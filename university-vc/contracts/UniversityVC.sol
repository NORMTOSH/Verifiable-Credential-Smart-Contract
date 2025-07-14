// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract UniversityVC {
    // The issuer's address (university) and its DID.
    address public issuer;
    string public issuerDID;
    uint256 public credentialCount;

    // Structure representing a verifiable credential.
    struct Credential {
        uint256 id;
        string studentDID;       // Credential Subject: student's DID
        string issuerDID;        // Issuer's DID (e.g., ABYA University's DID)
        string credentialType;   // Credential Type (e.g., Diploma, Course Completion)
        uint256 issueDate;       // Issue Date (timestamp when credential was issued)
        string metadata;         // Additional attributes (e.g., course details, grade)
        string credentialHash;   // Hash of the credential document
        string signature;        // Cryptographic signature to ensure authenticity
        string mappingCID;       // IPFS CID pointing to the full VC document
        bool valid;              // Status flag indicating if the credential is active
    }

    // Store credentials by their unique id.
    mapping(uint256 => Credential) public credentials;
    // Index credentials under each student DID.
    mapping(string => uint256[]) private studentIndex;

    // Events for logging issuance and revocation.
    event CredentialIssued(
        uint256 indexed id,
        string studentDID,
        string credentialType,
        uint256 issueDate,
        string credentialHash,
        string signature,
        string mappingCID
    );
    event CredentialRevoked(uint256 indexed id);

    // Modifier to restrict functions to only the issuer.
    modifier onlyIssuer() {
        require(msg.sender == issuer, "Only issuer can perform this action");
        _;
    }

    // Constructor accepts the issuer's DID.
    constructor(string memory _issuerDID) {
        issuer = msg.sender;
        issuerDID = _issuerDID;
    }

    /// @notice Issue a new credential, storing its IPFS CID.
    function issueCredential(
        string memory studentDID,
        string memory credentialType,
        string memory metadata,
        string memory credentialHash,
        string memory signature,
        string memory mappingCID
    ) public onlyIssuer {
        credentialCount++;
        credentials[credentialCount] = Credential(
            credentialCount,
            studentDID,
            issuerDID,
            credentialType,
            block.timestamp,
            metadata,
            credentialHash,
            signature,
            mappingCID,
            true
        );
        studentIndex[studentDID].push(credentialCount);

        emit CredentialIssued(
            credentialCount,
            studentDID,
            credentialType,
            block.timestamp,
            credentialHash,
            signature,
            mappingCID
        );
    }

    /// @notice Revoke an existing credential.
    function revokeCredential(uint256 id) public onlyIssuer {
        require(credentials[id].valid, "Credential already revoked");
        credentials[id].valid = false;
        emit CredentialRevoked(id);
    }

    /// @notice Verify a credential’s validity and that its hash matches.
    function verifyCredential(uint256 id, string memory credentialHash)
        public
        view
        returns (bool)
    {
        Credential memory cred = credentials[id];
        return (cred.valid &&
                keccak256(bytes(cred.credentialHash)) == keccak256(bytes(credentialHash)));
    }

    /// @notice Get all credential IDs issued to a given student DID.
    function getCredentialsForStudent(string memory studentDID)
        public
        view
        returns (uint256[] memory)
    {
        return studentIndex[studentDID];
    }
}
