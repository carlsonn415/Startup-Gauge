.PHONY: build deploy

build:
	cd rag-ingestion-worker && npx prisma generate
	cd rag-ingestion-worker && npm install
	sam build

deploy:
	sam deploy

deploy-guided:
	sam deploy --guided

