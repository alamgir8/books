const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const app = express();
const port = process.env.PORT || 5000;

// midleware
app.use(
  cors({
    origin: [
      // 'http://localhost:5173',
      "https://book-com.web.app",
      "https://book-com.firebaseapp.com",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = process.env.MONGO_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// middleware
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  // console.log('token in the middleware', token);
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN, (error, decoded) => {
    if (error) {
      return res.status(401).send({ message: "Unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const roomsCollection = client.db("Book_Dot_Com").collection("rooms");
    const bookingsCollection = client.db("Book_Dot_Com").collection("bookings");

    //jwt
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      console.log("email for token", user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
        })
        .send({ success: true });
    });

    app.post("/logOut", async (req, res) => {
      const user = req.body;
      console.log("logging out", user);
      res.clearCookie("token", { maxAge: 0 }).send({ success: true });
    });

    // rooms
    app.get("/rooms", async (req, res) => {
      const cursor = roomsCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/rooms/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await roomsCollection.findOne(query);
      res.send(result);
    });

    app.put("/rooms/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const request = req.body;
      // console.log(request.email);
      const room = await roomsCollection.findOne(query);
      if (request.booked == true) {
        const updateRoomBooking = {
          $set: {
            booked: true,
            email: request.email,
            time: request.time,
          },
        };

        const result = await roomsCollection.updateOne(
          query,
          updateRoomBooking
        );
        res.send(result);
      } else if (request.review) {
        const reviewsArray = room.reviews || [];
        const reviewMessage = req.body;
        reviewsArray.push(reviewMessage);
        const updateResult = {
          $set: {
            reviews: reviewsArray,
          },
        };

        const result = await roomsCollection.updateOne(query, updateResult);
        res.send(result);
      }
    });

    // bookings
    // app.get('/bookings', verifyToken, async (req, res) => {
    //     console.log('owner', req.user);
    //     const owner = req?.user?.email;
    //     if (req.user.email !== owner) {
    //         return res.status(403).send({ message: 'forbidden access' })
    //     }
    //     // let query = {};
    //     // if (req.query?.email) {
    //     //     query = { email: req.query.email }
    //     // }
    //     const query = { email: owner };
    //     const bookings = await roomsCollection.find(query).toArray();

    //     try {
    //         const result = await bookingsCollection.insertMany(bookings);
    //     }
    //     catch (error) {
    //         if (error.code === 11000) {
    //             const newBookings = [];

    //             for (const booking of bookings) {
    //                 const newBooking = { ...booking, _id: new ObjectId() };
    //                 newBookings.push(newBooking);
    //             }

    //             const result = await bookingsCollection.insertMany(newBookings);
    //             res.send(result);
    //         }
    //     }
    //     // console.log(result);
    //     res.send(result)
    // })
    app.get("/bookings", verifyToken, async (req, res) => {
      console.log("owner", req.user);
      const owner = req?.user?.email;

      if (req.user.email !== owner) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: owner };
      const bookings = await roomsCollection.find(query).toArray();

      try {
        const result = await bookingsCollection.insertMany(bookings);
        const insertedIds = Object.values(result.insertedIds);

        const insertedBookings = await bookingsCollection
          .find({ _id: { $in: insertedIds } })
          .toArray();

        res.send(insertedBookings);
      } catch (error) {
        if (error.code === 11000) {
          const newBookings = [];

          for (const booking of bookings) {
            const newBooking = { ...booking, _id: new ObjectId() };
            newBookings.push(newBooking);
          }

          const result = await bookingsCollection.insertMany(newBookings);

          const insertedIds = Object.values(result.insertedIds);

          const insertedBookings = await bookingsCollection
            .find({ _id: { $in: insertedIds } })
            .toArray();

          res.send(insertedBookings);
        } else {
          console.error("Error inserting bookings:", error);
          res.status(500).send({ message: "Internal Server Error" });
        }
      }
    });

    app.get("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingsCollection.findOne(query);
      res.send(result);
    });

    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      try {
        const result = await bookingsCollection.insertOne(booking);
        res.send(result);
      } catch (error) {
        if (error.code === 11000) {
          booking._id = new ObjectId();
          const result = await bookingsCollection.insertOne(booking);
          res.send(result);
        }
      }
    });

    app.put("/bookings/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedBooking = req.body.time;
      console.log(updatedBooking);
      const updateDoc = {
        $set: {
          time: updatedBooking,
        },
      };
      const result = await bookingsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id, "requested for delete");
      const query = { _id: new ObjectId(id) };
      const result = await bookingsCollection.deleteOne(query);
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

app.get("/", (req, res) => {
  res.send("Book.com Server is running");
});

app.listen(port, () => {
  console.log("listening port of", port);
});
