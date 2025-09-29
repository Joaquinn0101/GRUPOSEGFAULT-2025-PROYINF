# frontend/Dockerfile
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install

# Código
COPY . .

EXPOSE 5173
ENV VITE_API_BASE_URL=http://localhost:3000
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
