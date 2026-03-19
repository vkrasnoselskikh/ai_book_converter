import logging


logger = logging.getLogger(__name__)


class BookConverterError(Exception):
    """Base exception for the converter."""


class InputValidationError(BookConverterError):
    """Raised when the user provides an invalid input document."""


class OcrProcessingError(BookConverterError):
    """Raised when OCR processing fails."""


class OutputPackagingError(BookConverterError):
    """Raised when the final output cannot be assembled."""
