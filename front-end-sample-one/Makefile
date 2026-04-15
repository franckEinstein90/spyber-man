.PHONY: install dev api app both clean help

help:
	@echo "Cyber Crawler - Available Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make install     Install dependencies with uv"
	@echo ""
	@echo "Development:"
	@echo "  make api         Run FastAPI server only"
	@echo "  make app         Run Streamlit app only"
	@echo "  make both        Run both (API + Streamlit)"
	@echo "  make dev         Development setup"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean       Remove Python cache and build files"

install:
	uv sync

dev: install
	@echo "Development environment ready!"
	@echo "Run 'make api' in one terminal and 'make app' in another"

api:
	uv run python api.py

app:
	uv run streamlit run app.py

both:
	@echo "Starting API server..."
	uv run python api.py & \
	sleep 2; \
	echo "Starting Streamlit app..."; \
	uv run streamlit run app.py

clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	rm -rf build/ dist/ *.egg-info/
	@echo "Cleaned up Python cache files"
