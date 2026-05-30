setup:
	uv sync

ingest:
	uv run python -m elastic.ingest --mode both

run-api:
	uv run uvicorn api.main:app --reload --port 8000

run-console:
	cd console && npm run dev

run-feeders:
	uv run python -m elastic.ingest --mode both

surge:
	uv run python -m elastic.ingest --mode surge --zone gate_a --duration-minutes 2

# Replay the pre-recorded surge timeline (traffic + sentiment via ingest, crowd via cv feeder).
# Both processes run concurrently and exit after ~90 seconds.
replay:
	uv run python -m elastic.ingest --replay & uv run python -m cv.feeder --replay

test:
	uv run pytest tests/ -v

deploy:
	gcloud run deploy cityshield \
		--source . \
		--region us-central1 \
		--allow-unauthenticated \
		--memory 2Gi \
		--cpu 2 \
		--set-env-vars="ELASTIC_URL=$(ELASTIC_URL),ELASTIC_API_KEY=$(ELASTIC_API_KEY),GEMINI_MODEL=gemini-2.5-flash,GOOGLE_CLOUD_LOCATION=us-central1,GOOGLE_CLOUD_PROJECT=cityshield-hackathon,DEMO_MODE=true"

# Demo: start replay feeders, wait for data, POST /assess, open console.
# Expects the API (make run-api) to already be running on :8000.
demo:
	@echo "Starting replay feeders (traffic + sentiment + crowd)..."
	uv run python -m elastic.ingest --replay &
	uv run python -m cv.feeder --replay &
	@echo "Waiting 15 s for data to flow into Elasticsearch..."
	sleep 15
	@echo "Triggering /assess..."
	curl -s -X POST http://localhost:8000/assess \
		-H "Content-Type: application/json" \
		-d '{"zone": "gate_a"}' | python -m json.tool || true
	@echo "Opening operator console..."
	cd console && npm run dev &
	@echo ""
	@echo "=========================================="
	@echo " Demo ready — the surge will trigger in 30 seconds"
	@echo " Console: http://localhost:5173"
	@echo "=========================================="
