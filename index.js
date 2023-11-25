const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const app = express();
const port = process.env.PORT || 7000;

//middleware
app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);

// app.use((req, res, next) => {
//   // CORS headers
//   res.header("Access-Control-Allow-Origin", "https://namkeen-project.web.app"); // restrict it to the required domain
//   res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
//   // Set custom headers for CORS
//   res.header(
//     "Access-Control-Allow-Headers",
//     "Content-type,Accept,X-Custom-Header"
//   );

//   if (req.method === "OPTIONS") {
//     return res.status(200).end();
//   }

//   return next();
// });

app.use(cookieParser());

//mongodb connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ly9jdk7.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const contestCollection = await client
      .db("contestHubDB")
      .collection("contests");
    const userCollection = await client.db("contestHubDB").collection("users");

    //jwt access token
    app.post("/jwt", async (req, res) => {
      const userInfo = req.body;
      const token = jwt.sign(userInfo, process.env.ACCESS_TOKEN, {
        expiresIn: "365d",
      });

      console.log(token);
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    //verify token
    const verifyToken = (req, res, next) => {
      const { token } = req.cookies;
      if (!token) {
        return res.status(401).send({ message: "unauthorized" });
      }
      jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized" });
        }
        req.user = decoded;
        next();
      });
    };

    //post user data
    app.put("/users", async (req, res) => {
      const user = req.body;
      const filter = { email: user.email };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...user,
        },
      };
      console.log(updateDoc);
      const result = await userCollection.updateOne(filter, updateDoc, options);
      res.send(result);
    });

    //get users with verify token TODO----
    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    //get contests data
    app.get("/contests", async (req, res) => {
      // let query = {};
      let sortObj = {};

      const sortField = req.query.sortField;
      const sortOrder = req.query.sortOrder;

      if (sortField && sortOrder) {
        sortObj[sortField] = sortOrder;
      }

      const result = await contestCollection.find().sort(sortObj).toArray();
      res.send(result);
    });
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", async (req, res) => {
  res.send("Welcome to contestHub server");
});

app.listen(port, () => {
  console.log(`contestHub server running on port ${port}`);
});
