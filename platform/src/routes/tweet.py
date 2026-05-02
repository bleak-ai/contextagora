"""POST /api/tweet — generate a single tweet from an extracted social-post card.

Takes the SocialPostPayload (already produced by /api/sessions/{id}/social-post)
in the request body and returns the tweet text. No session DB access — the
card carries everything the tweet generator needs.
"""
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from src.models import TweetGenerateRequest, TweetPayload
from src.services.social import tweet

router = APIRouter(prefix="/api", tags=["tweet"])


@router.post("/tweet", response_model=TweetPayload)
async def api_generate_tweet(body: TweetGenerateRequest):
    try:
        payload = tweet.generate_tweet(body.card)
    except tweet.ExtractionError as e:
        return JSONResponse(
            {"error": f"Couldn't generate the tweet: {e}"},
            status_code=502,
        )

    return payload
