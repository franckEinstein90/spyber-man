#!/bin/bash

# Helper script to run the application

case "$1" in
  "api")
    echo "Starting FastAPI server..."
    python api.py
    ;;
  "app"|"streamlit")
    echo "Starting Streamlit app..."
    streamlit run app.py
    ;;
  "both")
    echo "Starting both API and Streamlit..."
    python api.py &
    sleep 2
    streamlit run app.py
    ;;
  *)
    echo "Cyber Crawler - Quick Start"
    echo ""
    echo "Usage: ./run.sh [command]"
    echo ""
    echo "Commands:"
    echo "  api              Start only the FastAPI server"
    echo "  app, streamlit   Start only the Streamlit app"
    echo "  both             Start both (API in background, Streamlit in foreground)"
    echo ""
    echo "Example:"
    echo "  ./run.sh both"
    ;;
esac
