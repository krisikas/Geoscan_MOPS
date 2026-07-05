FROM node:20-alpine

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем исходники
COPY . .

# Открываем порт Vite
EXPOSE 5173

# Запускаем dev-сервер, слушая все интерфейсы
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
