"""Strict validation for uploaded Solidity smart contract source files.

Enforces:
- File existence and non-emptiness
- Extension validation (.sol)
- Safe filename normalization (path traversal prevention)
- Maximum file size bounds (default: 100 KB)
- Text encoding validation (UTF-8, rejecting binary / null bytes)
- Solidity source heuristics (presence of pragma/contract/interface/library)
"""

import os
import re
import hashlib
from typing import Dict, Any, Optional, Tuple, List

MAX_FILE_SIZE_BYTES = 100 * 1024  # 100 KB


class ValidationError(Exception):
    """Raised when an uploaded file or source fails validation."""

    def __init__(self, message: str, code: str = "INVALID_INPUT", status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code

    def to_dict(self) -> Dict[str, Any]:
        return {
            "error": self.message,
            "code": self.code,
            "status": "error",
        }


def sanitize_filename(filename: Optional[str]) -> str:
    """Normalizes and sanitizes filename to prevent directory traversal and unsafe names."""
    if not filename or not filename.strip():
        raise ValidationError("File name cannot be empty.", code="MISSING_FILENAME")

    raw_name = os.path.basename(filename.strip().replace("\\", "/"))
    # Remove any lingering null bytes or control characters
    cleaned = re.sub(r"[\x00-\x1f\x7f]", "", raw_name)

    if not cleaned or cleaned in (".", ".."):
        raise ValidationError("Invalid file name.", code="INVALID_FILENAME")

    if not cleaned.lower().endswith(".sol"):
        raise ValidationError(
            f"Unsupported file type '{cleaned}'. Only .sol files are supported.",
            code="INVALID_EXTENSION",
        )

    # Restrict characters to safe alphanumeric, underscores, hyphens, and dots
    safe_name = re.sub(r"[^A-Za-z0-9_.-]", "_", cleaned)
    if not safe_name.lower().endswith(".sol"):
        safe_name += ".sol"

    return safe_name


def validate_solidity_source(
    source_content: Any,
    filename: Optional[str],
    max_size: int = MAX_FILE_SIZE_BYTES,
) -> Tuple[str, str, str, List[str]]:
    """Validates source text and returns (sanitized_name, cleaned_source, sha256_hash, contract_names).

    Args:
        source_content: String or bytes containing the file content.
        filename: Name of the file being submitted.
        max_size: Maximum allowed bytes.

    Returns:
        Tuple of (sanitized_filename, cleaned_source_text, source_hash, contract_names)
    """
    safe_filename = sanitize_filename(filename)

    if source_content is None:
        raise ValidationError("No source content supplied.", code="MISSING_INPUT")

    # Handle bytes or string
    if isinstance(source_content, bytes):
        if len(source_content) == 0:
            raise ValidationError("File is empty (0 bytes).", code="EMPTY_FILE")
        if len(source_content) > max_size:
            raise ValidationError(
                f"File size ({len(source_content)} bytes) exceeds the maximum allowed limit of {max_size} bytes (100 KB).",
                code="FILE_TOO_LARGE",
            )
        if b"\x00" in source_content:
            raise ValidationError(
                "Binary file content detected. Only valid UTF-8 Solidity text files are supported.",
                code="INVALID_ENCODING",
            )
        try:
            source_text = source_content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ValidationError(
                "Invalid file encoding. File must be valid UTF-8 text.",
                code="INVALID_ENCODING",
            ) from exc
    elif isinstance(source_content, str):
        encoded = source_content.encode("utf-8")
        if len(encoded) == 0 or not source_content.strip():
            raise ValidationError("Source is empty. Please provide valid Solidity code.", code="EMPTY_FILE")
        if len(encoded) > max_size:
            raise ValidationError(
                f"Source size ({len(encoded)} bytes) exceeds the maximum allowed limit of {max_size} bytes (100 KB).",
                code="FILE_TOO_LARGE",
            )
        if "\x00" in source_content:
            raise ValidationError(
                "Null bytes detected in source. Binary files are not supported.",
                code="INVALID_ENCODING",
            )
        source_text = source_content
    else:
        raise ValidationError("Unsupported source content type.", code="INVALID_TYPE")

    cleaned_source = source_text.strip()
    if not cleaned_source:
        raise ValidationError("Source code contains only whitespace.", code="EMPTY_FILE")

    # Solidity keyword heuristic check
    solidity_indicators = [
        r"\bpragma\s+solidity\b",
        r"\bcontract\s+[A-Za-z_$][\w$]*",
        r"\binterface\s+[A-Za-z_$][\w$]*",
        r"\blibrary\s+[A-Za-z_$][\w$]*",
    ]
    has_solidity_keyword = any(
        re.search(pattern, cleaned_source, re.IGNORECASE) for pattern in solidity_indicators
    )
    if not has_solidity_keyword:
        raise ValidationError(
            "The file does not appear to contain valid Solidity source code (missing pragma, contract, interface, or library declaration).",
            code="NOT_SOLIDITY",
        )

    # Strip comments before extracting contract names to avoid comments matching 'contract <word>'
    no_comments = re.sub(r"//.*", "", cleaned_source)
    no_comments = re.sub(r"/\*.*?\*/", "", no_comments, flags=re.DOTALL)
    contract_names = re.findall(r"\bcontract\s+([A-Za-z_$][\w$]*)", no_comments)

    # Compute source hash
    source_hash = hashlib.sha256(cleaned_source.encode("utf-8")).hexdigest()

    return safe_filename, cleaned_source, source_hash, contract_names
