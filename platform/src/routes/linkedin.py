"""POST /api/linkedin — generate a LinkedIn post from an extracted social-post card.

Mirrors routes/tweet.py. Takes the SocialPostPayload (already produced by
/api/sessions/{id}/social-post) in the request body and returns the post text.
"""
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from src.models import LinkedinGenerateRequest, LinkedinPayload
from src.services import linkedin

router = APIRouter(prefix="/api", tags=["linkedin"])


@router.post("/linkedin", response_model=LinkedinPayload)
async def api_generate_linkedin(body: LinkedinGenerateRequest):
    try:
        payload = linkedin.generate_linkedin(body.card)
    except linkedin.ExtractionError as e:
        return JSONResponse(
            {"error": f"Couldn't generate the LinkedIn post: {e}"},
            status_code=502,
        )

    return payload
