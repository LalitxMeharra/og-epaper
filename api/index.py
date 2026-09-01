from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import requests
import urllib.parse
import json
import base64
import hashlib
from Crypto.Cipher import AES

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/"

class ExtractRequest(BaseModel):
    date: str
    lang: str
    paper: str
    edition: str

def decode_payload(payload: str) -> str:
    decoded = ""
    for char in payload:
        idx = ALPHABET.find(char)
        if idx != -1:
            decoded += ALPHABET[62 - idx]
        else:
            decoded += char
    return decoded

@app.get("/api/config/{date}")
def get_config(date: str):
    url = f"https://www.tradingref.com/api/editions/{date}"
    headers = {"User-Agent": "Mozilla/5.0", "Referer": "https://www.tradingref.com/"}
    res = requests.get(url, headers=headers)
    if res.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to fetch config.")
    return res.json()

@app.post("/api/extract")
def extract_epaper(req: ExtractRequest):
    headers = {"User-Agent": "Mozilla/5.0", "Referer": "https://www.tradingref.com/"}
    target_url = f"https://www.tradingref.com/api/getPage/{req.date}/{req.lang}/{urllib.parse.quote(req.paper)}/{urllib.parse.quote(req.edition)}"
    
    res = requests.get(target_url, headers=headers)
    if res.status_code != 200:
        raise HTTPException(status_code=400, detail="Fetch failed.")
        
    session_id = res.headers.get("X-Session-Id")
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing X-Session-Id.")
        
    key = hashlib.sha256(session_id.encode('utf-8')).digest()
    data_json = res.json()
    encrypted_bytes = base64.b64decode(data_json.get("Data"))
    
    iv = encrypted_bytes[:12]
    ciphertext = encrypted_bytes[12:-16]
    tag = encrypted_bytes[-16:]

    try:
        cipher = AES.new(key, AES.MODE_GCM, nonce=iv)
        decrypted_text = cipher.decrypt_and_verify(ciphertext, tag).decode('utf-8', errors='ignore')
        
        parsed = json.loads(decrypted_text)
        encrypted_str = parsed.get("Data", parsed.get("pages", "")) if isinstance(parsed, dict) else decrypted_text
        
        decoded_str = decode_payload(encrypted_str)
        parts = decoded_str.split('q!')
        
        prefix = parts[1]
        suffix = parts[2]
        pages = [p for p in suffix.split('m%') if p.strip()]
        
        final_links = []
        for page in pages:
            direct_link = f"{prefix}{page}" if prefix.endswith('/') else f"{prefix}/{page}"
            wsrv_url = f"https://wsrv.nl/?url={urllib.parse.quote(direct_link, safe='')}&maxage=1d&output=jpg&q=100"
            final_links.append(wsrv_url)
            
        return {"status": "success", "pages": final_links, "total": len(final_links)}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
