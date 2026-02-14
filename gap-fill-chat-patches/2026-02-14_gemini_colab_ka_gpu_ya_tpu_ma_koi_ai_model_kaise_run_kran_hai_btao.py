# ==========================================
# 🚀 STEP 1: INSTALLATION (Ye zaroori hai)
# ==========================================
print("📦 Libraries install ho rahi hain... (Thora wait karein)")
!pip install -q -U torch transformers bitsandbytes accelerate fastapi uvicorn pyngrok nest_asyncio gradio pydantic langchain langchain-community langchain-text-splitters pypdf sentence-transformers chromadb duckduckgo-search

# ==========================================
# 🚀 STEP 2: IMPORTS & SETUP
# ==========================================
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from fastapi import FastAPI
from pydantic import BaseModel
import uvicorn
import nest_asyncio
from pyngrok import ngrok
import threading
import gradio as gr
import os

# RAG & Search Imports
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter 
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.tools import DuckDuckGoSearchRun

# ==========================================
# 🔑 APNA NGROK TOKEN YAHAN PASTE KAREIN
# ==========================================
NGROK_AUTH_TOKEN = "YAHAN_APNA_TOKEN_PASTE_KAREIN" 
# ==========================================

if NGROK_AUTH_TOKEN != "YAHAN_APNA_TOKEN_PASTE_KAREIN":
    ngrok.set_auth_token(NGROK_AUTH_TOKEN)
else:
    print("⚠️ WARNING: Ngrok Token missing! API Public nahi hogi.")

# ==========================================
# 🚀 STEP 3: LOAD MODEL (The Brain)
# ==========================================
print("🧠 Model Load ho raha hai...")
model_id = "Qwen/Qwen2.5-Coder-7B-Instruct"

quant_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.float16,
    bnb_4bit_use_double_quant=True,
)

tokenizer = AutoTokenizer.from_pretrained(model_id)
model = AutoModelForCausalLM.from_pretrained(
    model_id,
    quantization_config=quant_config,
    device_map="auto",
    torch_dtype=torch.float16
)
print("✅ Qwen-Coder Online!")

# ==========================================
# 🚀 STEP 4: TOOLS (RAG + WEB SEARCH)
# ==========================================
vector_db = None
search_tool = DuckDuckGoSearchRun() 

def process_files_for_rag(files):
    global vector_db
    if not files: return "⚠️ Koi file nahi mili."
    
    documents = []
    status = ""
    for file in files:
        try:
            if file.name.endswith(".pdf"):
                loader = PyPDFLoader(file.name)
                documents.extend(loader.load())
                status += f"📄 PDF: {os.path.basename(file.name)}\n"
            elif file.name.endswith(".txt"):
                loader = TextLoader(file.name)
                documents.extend(loader.load())
                status += f"📝 TXT: {os.path.basename(file.name)}\n"
        except Exception as e:
            status += f"❌ Error: {file.name} - {str(e)}\n"
    
    if documents:
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        chunks = text_splitter.split_documents(documents)
        embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
        vector_db = Chroma.from_documents(chunks, embeddings)
        return status + f"\n✅ Database Ready! ({len(chunks)} chunks)"
    return "❌ Koi text extract nahi hua."

# ==========================================
# 🚀 STEP 5: SMART CHAT LOGIC
# ==========================================
def smart_chat(prompt, history, use_web=False):
    global vector_db
    
    context_text = ""
    system_instruction = "You are an expert Developer & AI Assistant. Answer in Roman Urdu mixed with English."

    # 1. RAG Check
    if vector_db:
        docs = vector_db.similarity_search(prompt, k=3)
        rag_content = "\n".join([d.page_content for d in docs])
        context_text += f"\n\n[📂 File Context]:\n{rag_content}"
        system_instruction += " Use the File Context to answer."

    # 2. Web Search Check
    if use_web:
        try:
            print("🌐 Searching Internet...")
            web_results = search_tool.run(prompt)
            context_text += f"\n\n[🌍 Web Search Results]:\n{web_results}"
            system_instruction += " Use the Web Search Results for latest info."
        except Exception as e:
            context_text += f"\n[Web Error]: {str(e)}"

    # 3. Prompt Construction
    messages = [{"role": "system", "content": system_instruction}]
    
    for user_msg, bot_msg in history:
        messages.append({"role": "user", "content": user_msg})
        messages.append({"role": "assistant", "content": bot_msg})
    
    final_user_message = f"{prompt}\n{context_text}"
    messages.append({"role": "user", "content": final_user_message})
    
    # 4. Generate
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    model_inputs = tokenizer([text], return_tensors="pt").to("cuda")
    
    generated_ids = model.generate(
        model_inputs.input_ids,
        max_new_tokens=1024,
        temperature=0.7,
        do_sample=True
    )
    
    generated_ids = [output_ids[len(input_ids):] for input_ids, output_ids in zip(model_inputs.input_ids, generated_ids)]
    response = tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0]
    return response

# ==========================================
# 🚀 STEP 6: API SETUP (FastAPI)
# ==========================================
app = FastAPI()

class APIRequest(BaseModel):
    prompt: str
    use_web: bool = False

@app.post("/chat")
def api_endpoint(req: APIRequest):
    response = smart_chat(req.prompt, [], req.use_web)
    return {"response": response}

def run_api():
    nest_asyncio.apply()
    uvicorn.run(app, host="0.0.0.0", port=8000)

thread = threading.Thread(target=run_api)
thread.start()

try:
    public_url = ngrok.connect(8000).public_url
    print(f"\n🌍 API LIVE: {public_url}")
except:
    print("⚠️ Ngrok Error. Token check karein.")

# ==========================================
# 🚀 STEP 7: UI SETUP (Gradio)
# ==========================================
with gr.Blocks(theme=gr.themes.Soft(), title="Ultimate AI Studio") as demo:
    gr.Markdown("# 🚀 Ultimate AI Studio (Chat + Files + Internet + API)")
    gr.Markdown(f"**API Endpoint:** `{public_url}/chat`")
    
    with gr.Row():
        with gr.Column(scale=1, variant="panel"):
            gr.Markdown("### 📂 Upload Knowledge")
            files = gr.File(file_count="multiple", label="PDF/TXT")
            upload_btn = gr.Button("Process Files", variant="primary")
            status = gr.Textbox(label="Status", interactive=False)
            
            gr.Markdown("### 🌐 Tools")
            web_checkbox = gr.Checkbox(label="Enable Internet Search", value=False)
            
        with gr.Column(scale=3):
            chat = gr.ChatInterface(
                fn=smart_chat,
                additional_inputs=[web_checkbox],
                title="Qwen Pro Chat",
            )
            
    upload_btn.click(process_files_for_rag, inputs=[files], outputs=[status])

demo.launch(share=True)