FROM node:20.11.0-alpine
# working directory 
WORKDIR /app
# copy package.json to the working directory
COPY package.json .
# install the dependencies
RUN npm install
# copy the source code to the working directory
COPY . ./
# Build the application
RUN npm run build
# Expose the application port 
EXPOSE 3000
# Start the application 
CMD ["npm", "start"]