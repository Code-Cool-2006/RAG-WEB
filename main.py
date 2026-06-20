import os
import shutil
from typing import List
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv

import chromadb
from llama_index.core import SimpleDirectoryReader, VectorStoreIndex, StorageContext, Settings
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.prompts import PromptTemplate
from llama_index.embeddings.google_genai import GoogleGenAIEmbedding
from llama_index.llms.google_genai import GoogleGenAI
from llama_index.vector_stores.chroma import ChromaVectorStore

# Load environment variables
load_dotenv()

PERSISTENT_ROOT = os.environ.get("PERSISTENT_STORAGE_PATH", ".")
DATA_DIR = os.path.join(PERSISTENT_ROOT, "data")
CHROMA_DIR = os.path.join(PERSISTENT_ROOT, "chroma_db")
COLLECTION_NAME = "notes"
CHUNK_SIZE = 800
CHUNK_OVERLAP = 100
EMBED_MODEL = "text-embedding-004"
LLM_MODEL = "gemini-1.5-flash"
TOP_K = 4

# Create data directories
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs("static", exist_ok=True)

app = FastAPI(title="RAG Notes Web Interface")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Configure global LlamaIndex settings
Settings.embed_model = GoogleGenAIEmbedding(model_name=EMBED_MODEL)
Settings.llm = GoogleGenAI(model=LLM_MODEL)
Settings.node_parser = SentenceSplitter(chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)

# Custom prompt forcing strict grounding
QA_TEMPLATE = PromptTemplate(
    "Context from the user's notes is below.\n"
    "---------------------\n{context_str}\n---------------------\n"
    "Answer the question using ONLY the context above. "
    "If the answer isn't in the context, say so explicitly — do not guess.\n"
    "Question: {query_str}\nAnswer: "
)

class QueryRequest(BaseModel):
    question: str

class QueryResponse(BaseModel):
    answer: str
    sources: List[dict]

def get_index():
    chroma_client = chromadb.PersistentClient(path=CHROMA_DIR)
    chroma_collection = chroma_client.get_or_create_collection(COLLECTION_NAME)
    vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
    
    # Check if we have documents in the collection
    count = chroma_collection.count()
    if count == 0:
        return None
    return VectorStoreIndex.from_vector_store(vector_store)

@app.post("/api/query", response_model=QueryResponse)
def query_notes(request: QueryRequest):
    try:
        index = get_index()
        if not index:
            return QueryResponse(
                answer="No documents have been indexed yet. Please upload files in the left panel and click 'Ingest/Re-index' first.",
                sources=[]
            )
        
        query_engine = index.as_query_engine(
            similarity_top_k=TOP_K,
            text_qa_template=QA_TEMPLATE,
        )
        
        response = query_engine.query(request.question)
        
        sources = []
        for node in response.source_nodes:
            fname = node.metadata.get("file_name", "unknown")
            score = node.score if node.score is not None else 0.0
            sources.append({
                "file_name": fname,
                "score": score,
                "text": node.text[:300] + "..."  # first 300 chars snippet
            })
            
        return QueryResponse(answer=str(response), sources=sources)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ingest")
def ingest_notes():
    try:
        documents = SimpleDirectoryReader(DATA_DIR, recursive=True).load_data()
        
        chroma_client = chromadb.PersistentClient(path=CHROMA_DIR)
        try:
            chroma_client.delete_collection(COLLECTION_NAME)
        except Exception:
            pass
        
        chroma_collection = chroma_client.get_or_create_collection(COLLECTION_NAME)
        
        if len(documents) == 0:
            return {"success": True, "count": 0, "message": "No documents found. Collection reset."}
            
        vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
        storage_context = StorageContext.from_defaults(vector_store=vector_store)
        
        # Ingest and create vector index
        VectorStoreIndex.from_documents(documents, storage_context=storage_context)
        return {"success": True, "count": len(documents)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/documents/clear")
def clear_documents():
    try:
        # Delete files in DATA_DIR
        for root, dirs, files in os.walk(DATA_DIR):
            for file in files:
                os.remove(os.path.join(root, file))
            for d in dirs:
                shutil.rmtree(os.path.join(root, d))
                
        # Reset ChromaDB collection
        chroma_client = chromadb.PersistentClient(path=CHROMA_DIR)
        try:
            chroma_client.delete_collection(COLLECTION_NAME)
        except Exception:
            pass
        chroma_client.get_or_create_collection(COLLECTION_NAME)
        
        return {"success": True, "message": "All documents and vector stores cleared successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/documents")
def list_documents():
    try:
        docs = []
        for root, _, files in os.walk(DATA_DIR):
            for file in files:
                fpath = os.path.join(root, file)
                stat = os.stat(fpath)
                docs.append({
                    "name": file,
                    "size": stat.st_size,
                    "path": os.path.relpath(fpath, DATA_DIR)
                })
        return {"documents": docs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/upload")
def upload_files(files: List[UploadFile] = File(...)):
    try:
        uploaded = []
        for file in files:
            fname = os.path.basename(file.filename)
            fpath = os.path.join(DATA_DIR, fname)
            with open(fpath, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            uploaded.append(fname)
        return {"success": True, "uploaded": uploaded}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
def read_index():
    # Helper to return the index.html explicitly
    index_path = os.path.join("static", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Welcome to RAG Notes. Please create static/index.html first."}

# Mount static files after standard endpoints to avoid routing conflicts
app.mount("/", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    import uvicorn
    # Run the server locally on port 8000
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
