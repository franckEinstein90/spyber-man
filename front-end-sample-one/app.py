import streamlit as st
import requests

st.set_page_config(page_title="Cyber Crawler", layout="wide")
st.title("🕷️ Cyber Crawler")

# Configuration
API_BASE_URL = "http://localhost:3000"
CALLBACK_URL = "http://localhost:8000/api/crawl-results"

SAMPLE_URLS = {
    "Python": ["https://www.python.org"],
    "Docs + News": ["https://docs.python.org/3/", "https://news.ycombinator.com"],
}

# Initialize session state
if "last_response" not in st.session_state:
    st.session_state.last_response = None
if "urls_input" not in st.session_state:
    st.session_state.urls_input = ""

st.write("Submit URLs to crawl via the API")

# Create two columns
col1, col2 = st.columns([2, 1])

with col1:
    st.subheader("📝 Input URLs")
    sample_col1, sample_col2 = st.columns(2)

    with sample_col1:
        if st.button("Use Python URL", use_container_width=True):
            st.session_state.urls_input = "\n".join(SAMPLE_URLS["Python"])

    with sample_col2:
        if st.button("Use 2 Real URLs", use_container_width=True):
            st.session_state.urls_input = "\n".join(SAMPLE_URLS["Docs + News"])

    urls_text = st.text_area(
        "Enter URLs (one per line)",
        key="urls_input",
        height=150,
        placeholder="https://www.python.org\nhttps://news.ycombinator.com"
    )

with col2:
    st.subheader("⚙️ Controls")
    st.caption(f"Callback endpoint: {CALLBACK_URL}")
    
    # Parse URLs from text
    urls_list = [url.strip() for url in urls_text.split("\n") if url.strip()]
    st.write(f"URLs to send: **{len(urls_list)}**")
    
    if st.button("🚀 Send to API", use_container_width=True):
        if not urls_list:
            st.error("Please enter at least one URL")
        else:
            try:
                # Prepare request
                payload = {
                    "urls": [
                        {"url": url, "callbackUrl": CALLBACK_URL}
                        for url in urls_list
                    ]
                }
                
                # Send POST request
                with st.spinner("Sending request..."):
                    response = requests.post(
                        f"{API_BASE_URL}/api/process-events",
                        json=payload,
                        timeout=10
                    )
                    response.raise_for_status()
                    
                st.session_state.last_response = response.json()
                st.success("✅ Request sent successfully!")
                
            except requests.exceptions.ConnectionError:
                st.error(f"❌ Cannot connect to API at {API_BASE_URL}")
                st.info("Make sure the API is running: `python api.py`")
            except requests.exceptions.JSONDecodeError:
                st.error("❌ Invalid response from API")
            except Exception as e:
                st.error(f"❌ Error: {str(e)}")

# Display last response
if st.session_state.last_response:
    st.subheader("📊 Last Response")
    st.json(st.session_state.last_response)

# API Status
with st.expander("ℹ️ API Status"):
    col_status1, col_status2 = st.columns(2)
    
    with col_status1:
        if st.button("Check API Health"):
            try:
                response = requests.get(f"{API_BASE_URL}/health", timeout=5)
                if response.status_code == 200:
                    st.success("✅ API is running")
            except:
                st.error("❌ API is not responding")
    
    with col_status2:
        st.write(f"API URL: `{API_BASE_URL}`")

# Usage instructions
with st.expander("📖 Usage Guide"):
    st.markdown("""
    ### Quick Start
    1. Start the API server:
       ```bash
       python api.py
       ```
    2. In another terminal, start Streamlit:
       ```bash
       streamlit run app.py
       ```
    3. Enter URLs in the text area (one per line)
    4. Click "Send to API" to submit the crawl request
    
    ### API Endpoint
    - **URL**: `POST http://localhost:3000/api/process-events`
        - **Callback Receiver**: `POST http://localhost:8000/api/crawl-results`
    - **Content-Type**: `application/json`
    - **Example Request**:
      ```json
      {
        "urls": [
                    {
                        "url": "https://www.python.org",
                        "callbackUrl": "http://localhost:8000/api/crawl-results"
                    },
                    {
                        "url": "https://news.ycombinator.com",
                        "callbackUrl": "http://localhost:8000/api/crawl-results"
                    }
        ]
      }
      ```
    """)
