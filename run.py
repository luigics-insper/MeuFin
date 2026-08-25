"""MeuFin — rode com: python run.py"""
import uvicorn

if __name__ == "__main__":
    print("\n  MeuFin rodando em http://localhost:8000\n")
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000)
