setup: package.json
	sudo add-apt-repository ppa:chris-lea/node.js -y
	sudo apt-get update
	sudo apt-get install nodejs -y
	npm config set registry http://registry.npmjs.org/
	sudo npm install

	sudo port install mongodb || sudo apt-get install mongodb
	NODE_ENV=development

	mongod &
	mongorestore -d github-balance ghbalance_db/github-balance
	killall mongod

test:
	@for t in $$(ls tests); do \
		./node_modules/.bin/mocha -R spec tests/$$t; \
	done

run:
	@mongod &
	@echo "Server running at localhost:3000"
	@node app.js

db-export:
	rm -rf ghbalance_db
	mongod &
	mongodump -d github-balance -o ghbalance_db

db-import:
	mongod &
	mongorestore -d github-balance ghbalance_db/github-balance

db-drop:
	mongod &
	mongo github-balance --eval "db.dropDatabase();"
