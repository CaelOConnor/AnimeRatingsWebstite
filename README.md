# AnimeRatingsWebstite
A website that allows users to give ratings and ratings for shows by season and the show as a whole.


To work in dev run: docker compose up --build

To run tests cd backend then run: npm test

To take down container run: docker compose down




do this: npm install --save-dev supertest


for dev to load 100 shows:
$token = "jwt_here"
docker compose exec -e SEED_TOKEN=$token backend node seed.js


to create an admin account: docker compose exec backend node scripts/createAdmin.js