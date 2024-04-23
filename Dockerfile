FROM node:20.11.0-alpine
# working directory 
WORKDIR /app
# copy package.json to the working directory
COPY package.json /app
# install the dependencies
RUN npm install
# copy the source code to the working directory
COPY . /app
# start the application
EXPOSE 3000
CMD ["npm", "dev"]