const express = require("express");
require("dotenv").config();
const cors = require("cors");
const jwt = require("jsonwebtoken");
// const stripe = require("stripe")(process.env.PAYMENT_KEY);

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const cookieParser = require("cookie-parser");
const app = express();
const port = process.env.PORT || 7000;

// middleware
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://contesthub-project.web.app",
  ],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());

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
    const contestCollection = await client
      .db("contestHubDB")
      .collection("contests");
    const userCollection = await client.db("contestHubDB").collection("users");
    const paymentCollection = await client
      .db("contestHubDB")
      .collection("payments");
    const createdContestCollection = await client
      .db("contestHubDB")
      .collection("createdContest");

    //jwt access token
    app.post("/jwt", async (req, res) => {
      const userInfo = req.body;
      const token = jwt.sign(userInfo, process.env.ACCESS_TOKEN, {
        expiresIn: "365d",
      });

      console.log(token);
      res
        .cookie("access-token", token, {
          httpOnly: true,
          // secure: process.env.NODE_ENV === "production",
          // sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",

          //deploy
          secure: true,
          sameSite: "none",
        })
        .send({ success: true });
    });

    //logout with clear cookie
    app.get("/logout", async (req, res) => {
      try {
        res
          .clearCookie("access-token", {
            maxAge: 0,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ success: true });
        console.log("Logout successful");
      } catch (err) {
        res.status(500).send(err);
      }
    });

    //verify token
    const verifyToken = (req, res, next) => {
      const token = req?.cookies?.["access-token"];
      console.log("token from verify token", token);

      if (!token) {
        return res.status(401).send({ message: "unauthorized" });
      }
      jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
          return res.status(401).send({ message: "You are not authorized" });
        }
        req.user = decoded;
        next();
      });
    };

    //verify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.user.email;
      // console.log(email, "admin here");
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        console.log({ isAdmin }, "not admin");

        return res.status(403).send({ message: "forbidden access" });
      }
      console.log({ isAdmin }, "verified admin");

      next();
    };
    //verify creator
    const verifyCreator = async (req, res, next) => {
      // console.log(req.user, "from creator");
      const email = req.user.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isCreator = user?.role === "creator";
      if (!isCreator) {
        return res.status(403).send({ message: "forbidden access" });
      }
      console.log({ isCreator }, "verified creator");
      next();
    };

    //get admin
    app.get("/user/admin", verifyToken, async (req, res, next) => {
      const email = req.query.email;
      console.log(req.user);
      if (email !== req.user.email) {
        return res.status(403).send({ message: "Unauthorized" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    //get creator
    app.get("/user/creator/:email", verifyToken, async (req, res, next) => {
      const email = req.params.email;
      console.log(req.user);
      if (email !== req.user.email) {
        return res.status(403).send({ message: "Unauthorized" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let creator = false;
      if (user) {
        creator = user?.role === "creator";
      }
      res.send({ creator });
    });

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
    app.get("/get-all-users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    //set user role
    app.patch(
      "/set-user-role/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const role = req.body;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            ...role,
          },
        };
        const updateResult = await userCollection.updateOne(filter, updateDoc);
        res.send(updateResult);
      }
    );

    //get pending/all contests
    app.get(
      "/get-pending-contests",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const filter = { status: "pending" };

        const result = await createdContestCollection.find(filter).toArray();
        const allContests = await contestCollection.find().toArray();
        res.send([...result, ...allContests]);
      }
    );
    //delete pending/any contest by admin
    app.delete(
      "/delete-pending-contest/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        id = req.params.id;
        const query = { _id: new ObjectId(id) };

        const fromPending = await createdContestCollection.deleteOne(query);

        const fromAll = await contestCollection.deleteOne(query);
        res.send({ fromPending, fromAll });
      }
    );
    //confirm pending contests
    app.patch(
      "/confirm-pending-contest/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const contest = req.body;
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: "confirmed",
          },
        };
        const updateResult = await createdContestCollection.updateOne(
          filter,
          updateDoc
        );
        const addResult = await contestCollection.insertOne(contest);
        res.send({ updateResult, addResult });
      }
    );
    //manage user roles by admin
    app.patch(
      "/set-user-roles/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const role = req.body;
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            ...role,
          },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    //creator created contest collection
    app.post(
      "/creator-contest",
      verifyToken,
      verifyCreator,
      async (req, res) => {
        const contest = req.body;
        const result = await createdContestCollection.insertOne(contest);
        res.send(result);
      }
    );
    //get creator created contests
    app.get(
      "/creator/contest",
      verifyToken,
      verifyCreator,
      async (req, res) => {
        const email = req.query.email;

        const query = { email: email };
        const result = await createdContestCollection.find(query).toArray();
        res.send(result);
      }
    );

    //delete contest for creator
    app.delete(
      "/creator/contest/:id",
      verifyToken,
      verifyCreator,
      async (req, res) => {
        id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await createdContestCollection.deleteOne(query);
        res.send(result);
      }
    );
    //get contests data
    app.get("/contests", async (req, res) => {
      const search = req.query.tags;
      let query = {};
      if (search) {
        query.tags = { $regex: new RegExp(search, "i") };
      }
      let sortObj = {};

      const sortField = req.query.sortField;
      const sortOrder = req.query.sortOrder;

      if (sortField && sortOrder) {
        sortObj[sortField] = sortOrder;
      }

      const result = await contestCollection
        .find(query)
        .sort(sortObj)
        .toArray();
      res.send(result);
    });

    //single contest
    app.get("/contests/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await contestCollection.findOne(query);
      res.send(result);
    });

    //post payment
    app.post("/user-payments", async (req, res) => {
      const payment = req.body;
      const result = await paymentCollection.insertOne(payment);
      res.send(result);
    });

    app.get("/user-payments", verifyToken, async (req, res) => {
      const email = req.query.email;
      const tokenEmail = req.user.email;
      if (email !== tokenEmail) {
        return res.status(403).send({ message: "forbidden" });
      }
      const query = { email: email };
      const cursor = paymentCollection.find(query);
      const result = await cursor.toArray();
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
