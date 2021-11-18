const express = require('express')
const app = express()
const cors = require('cors');
const admin = require("firebase-admin");
require('dotenv').config();
const { MongoClient } = require('mongodb');
const ObjectId = require('mongodb').ObjectId;

const fileUpload = require("express-fileupload");



//STRIPE_SECRET ADD 
const stripe = require("stripe")(process.env.STRIPE_SECRET);

app.use(fileUpload());

const port = process.env.PORT || 5000;

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.3zctf.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
// console.log(uri)

async function verifyToken(req, res, next) {
    if (req.headers?.authorization?.startsWith('Bearer ')) {
        const token = req.headers.authorization.split(' ')[1];

        try {
            const decodedUser = await admin.auth().verifyIdToken(token);
            req.decodedEmail = decodedUser.email;
        }
        catch {

        }

    }
    next();
}

async function run() {
    try {
        await client.connect();
        const database = client.db('doctors_portal');
        const appointmentsCollection = database.collection('appointments');
        const usersCollection = database.collection('users');
        const doctorsCollection = database.collection('doctors');

        app.get('/appointments', verifyToken, async (req, res) => {
            const email = req.query.email;
            const date = req.query.date;

            const query = { email: email, date: date }

            const cursor = appointmentsCollection.find(query);
            const appointments = await cursor.toArray();
            res.json(appointments);
        })

        app.get('/appointments/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await appointmentsCollection.findOne(query);
            res.json(result);
        })

        app.post('/appointments', async (req, res) => {
            const appointment = req.body;
            const result = await appointmentsCollection.insertOne(appointment);
            res.json(result)
        });

        app.put('/appointments/:id', async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updateDoc = {
                $set: {
                    payment: payment
                }
            };
            const result = await appointmentsCollection.updateOne(filter, updateDoc);
            res.json(result);
        });

        // doctors api
        app.get('/doctors', async (req, res) => {
            const cursor = doctorsCollection.find({});
            const doctors = await cursor.toArray();
            res.json(doctors);
        });

        app.get('/doctors/:id', async (req, res) => {
            const query = { _id: ObjectId(req.params.id) }
            const doctor = await doctorsCollection.findOne(query);
            res.json(doctor);
        });

        app.post('/doctors', async (req, res) => {
            const name = req.body.name;
            const email = req.body.email;
            const pic = req.files.image;
            const picData = pic.data;
            const encodedPic = picData.toString('base64');
            const imageBuffer = Buffer.from(encodedPic, 'base64');
            const doctor = {
                name,
                email,
                image: imageBuffer
            }
            const result = await doctorsCollection.insertOne(doctor);
            res.json(result);
        })

        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            let isAdmin = false;
            if (user?.role === 'admin') {
                isAdmin = true;
            }
            res.json({ admin: isAdmin });
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            console.log(result);
            res.json(result);
        });

        app.put('/users', async (req, res) => {
            const user = req.body;
            const filter = { email: user.email };
            const options = { upsert: true };
            const updateDoc = { $set: user };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.json(result);
        });

        app.put('/users/admin', verifyToken, async (req, res) => {
            const user = req.body;
            const requester = req.decodedEmail;
            if (requester) {
                const requesterAccount = await usersCollection.findOne({ email: requester });
                if (requesterAccount.role === 'admin') {
                    const filter = { email: user.email };
                    const updateDoc = { $set: { role: 'admin' } };
                    const result = await usersCollection.updateOne(filter, updateDoc);
                    res.json(result);
                }
            }
            else {
                res.status(403).json({ message: 'you do not have access to make admin' })
            }

        })

        app.post('/create-payment-intent', async (req, res) => {
            const paymentInfo = req.body;
            const amount = paymentInfo.price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                payment_method_types: ['card']
            });
            res.json({ clientSecret: paymentIntent.client_secret })
        })

    }
    finally {
        // await client.close();
    }
}


run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello Doctors portal!')
})

app.listen(port, () => {
    console.log(`listening at ${port}`)
})

// app.get('/users')
// app.post('/users')
// app.get('/users/:id')
// app.put('/users/:id');
// app.delete('/users/:id')
// users: get
// users: post






// DB_USER=doctorDB
// DB_PASS=ocvuvVQhhAr44ZfD
// STRIPE_SECRET=sk_test_51JwWT6HugW2b8M8Ta4mEceXAz1AiSDyjpmDlUpioeLbB5wtmGL1QCy4Pxbhbjrx5PENZNd9g1yN9hlZ2DpQLV3GW00eRO00Qkm
// FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"doctors-portal-f9575","private_key_id":"4406625100cb40d57661b44b133e9268455b43c7","private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQClH/2REQ6Cmc87\nd9JsJd8nZV9ifmXJZwnO41Z/85n69l/u8f7GHMocdYbcjoNUTJTfXO9N5yJQ9V6a\nLeDabBVR7UCCxbIYixidbT37NL+1RlD8PjPuNCOYnXrVO12fRYGz2AYtV76FeeEj\nRxwo+gQRj/Vez2LHcMoX+uoNpYdr7ynaWqzEU2IsZA0jcdXFdUQPZUSdjBj1GpPY\nux1izSswOzrrxSbxogR34itfuaL6GtjeWaTdIzkwQXp7DgAOTgwNvEspxXfzx5lE\nxMPx1KvJIBNOgfUukBG/3dqX3GiinEwkxooBH8i0MmWmjrGVdQAMaWIR8QoYWH2w\nMIrdqm4VAgMBAAECggEAGtuWNGyazev971qbnj2Wtg4LXWDZENDdS9+2/RQpUnmV\nEa9zf35v8qsRvCQYq7MnxSDqR43gYLIC/imXg3obCaVWXdmRZePnUAvUY1ypZe8W\n/cA8VXKjljo0dXm0zlLRjZKwhoWEFqpupSdMJu9rjqkPVv7SaUV+NDelWYI4AaUK\nKhbSURDjsTz5rMX6aAn/fNObb4AqiFlxP4sNuwMeZ9n0JlrbQiofEUFGDt2W1T/z\n/MyPoAw9E8kqaLNlmNxWlulbtqQfdpOohch82BHYjxAHSj7DlTVSNV30g8m0XkE4\nGFTjzDHjYRaTRbfA4J57lmIrBdPtLKDM66L87gapzQKBgQDgBNtnYf5W8nbFkWqa\nIyQ6apeQvmfkwzNGTuPxpOIu6oNb87q3RhnpCvWCFpiDgDrUc1rIcYMw18mvfQJs\nuMbeBboI4gPNf7SQKhXBSP49A5goc1JeEPITagqK/S1iqpmm4XRHKY1JOxI/TvPZ\nfJMI6NFhRFTbig3IxBGi4FLhvwKBgQC8ssEzV8zjZ7NtfUVdizxW5g9hIn/Ki5Q3\n0AHfUGrsYfPAD6wQRVwIWx7e5skKVouGLE0eQcr+aRS9QCQpFxav6ySkeQZXJFbQ\nS94fTAQit0R5AcUZvPKx8MuSnUe2NqMok3AymO5BohTgso1K/uOT1kr7m5xJLxoa\nBrVX5Qw9KwKBgQDT2aQHg7N8VDWgJyHR/HOxTsZg2r/zpenijo6gIdbImXx6Q+cK\nlR/BtFxylp3KlkSMTz7GGhr/4MHZ1HWrjZ57rpy888i22RNP1ozWSgosdy646j41\nuP7E/15TDJSUH1PJbqKA/bmgTF24Qxj2TwnZvhrsSiuZplfcyhcHme6njwKBgQCw\n7A0XXaAeK1HhO445Cd5WP7h1w4n712jt95p5zgWigqivEEKssst6jizgo5QlnEWP\nVKQt1VRFuzKVyrjcyegcoyUlDNA0Dj9TZ37o6zYJcrnBlzY9Tppi2jmUyuC86HeM\nCMkut5LUeOqITwEJKvkn2MlPJXSgbYhUlKucsIYMJwKBgEfixHYq8jc7/X11cmYC\nk7cUuwWKmhKaBiJ3t8tpHvod+b9oOsrYlZlCn0GNpX2lTK8nuHXnbaPrmpfcbWx/\nDWNM3iLMcWnZQ1B0Psd+WUmSvracxc0ADaLDyI9mP9iCaq63SeeZqSYkLP9UntIY\ns1Y4UncoJjW5UI5lSPhlRo4L\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-sa8tr@doctors-portal-f9575.iam.gserviceaccount.com","client_id":"117788428038101441470","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-sa8tr%40doctors-portal-f9575.iam.gserviceaccount.com"}