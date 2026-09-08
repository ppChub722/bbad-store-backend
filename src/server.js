const app = require('./app');
const { connectToDB } = require('./database');

const DEFAULT_PORT = 10000;
const port = process.env.PORT || DEFAULT_PORT;

// Connect before accepting traffic. Starting the server first would let it
// answer requests it cannot serve, which is how a broken deployment ends up
// looking healthy.
connectToDB()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server started @ ${port}`);
    });
  })
  .catch((error) => {
    console.error('Startup failed — could not reach the data source.');
    console.error(error);
    process.exit(1);
  });
