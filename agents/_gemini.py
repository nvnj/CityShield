"""Shared Gemini client helpers for CityShield agents."""

import os

import google.genai as genai


def get_client() -> genai.Client:
    return genai.Client(
        vertexai=True,
        project=os.environ["GOOGLE_CLOUD_PROJECT"],
        location=os.getenv("GOOGLE_CLOUD_LOCATION", "us"),
    )


def extract_text(response) -> str:
    """Extract text from a Gemini response, handling thinking models.

    Thinking models (gemini-2.5-*, gemini-3.5-*) emit thought tokens that
    consume max_output_tokens before the actual text part. response.text is
    None when parts are empty. We iterate parts to find the non-thought text.
    """
    # Fast path: .text is populated for standard (non-thinking) models
    if response.text is not None:
        return response.text

    # Thinking model path: find the text part that isn't a thought
    if response.candidates:
        content = response.candidates[0].content
        if content and content.parts:
            for part in content.parts:
                if not getattr(part, "thought", False) and part.text:
                    return part.text

    raise ValueError(
        f"Gemini response has no text content. "
        f"finish_reason={response.candidates[0].finish_reason if response.candidates else 'N/A'}"
    )


def strip_fences(text: str) -> str:
    """Strip markdown code fences defensively before JSON parsing."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
    if text.endswith("```"):
        text = text.rsplit("```", 1)[0]
    return text.strip()
