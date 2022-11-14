import express from 'express'
import cors from 'cors'
import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv'
import joi from 'joi'
import dayjs from 'dayjs'
dotenv.config()

const app = express()
app.use(express.json())
app.use(cors())

const mongoClient = new MongoClient(process.env.MONGO_URI)
let db = mongoClient.db("bate_papo_uol")

const participantSchema = joi.object({
    name: joi.string().min(3).required()
})

const messageSchema = joi.object ({
    to: joi.string().min(1).required(),
    text: joi.string().min(1).required(),
    type: joi.any().valid('message', 'private_message')
})


app.post("/participants", async (req, res) => {

    const participant = req.body
    const validation = participantSchema.validate(participant)

    if(validation.error){
        res.sendStatus(422)
        return
    }

    try{
        const userInUse = await db.collection('participants').findOne({name:req.body.name})
    
        if(userInUse){
            res.sendStatus(409)
            return
        }

        await db.collection('participants').insertOne({name: participant.name, lastStatus: Date.now()})

        await db.collection('messages').insertOne({
            from:req.body.name,
            to:'Todos', 
            text:'entra na sala...', 
            type:'status',
            time:dayjs().format('HH:mm:ss')})
                                                    
        res.sendStatus(200)
    } catch (err){
        res.sendStatus(500)
    }
})

app.get("/participants", async (req,res) => {

    try {
        const participants = await db.collection('participants').find().toArray()
        res.status(200).send(participants)
    }catch (err) {
        res.sendStatus(404)
    }

})

app.post("/messages", async (req, res) => {

    const message = req.body
    const user = req.headers.user
    const type = req.body.type
    const validation = messageSchema.validate(message)

    if(validation.error){
        res.sendStatus(422)
        return
    }

    try {
        const participant = await db.collection('participants').findOne({name:user})

        if(!participant){
            res.status(422).send('Participante desconectado')
            return
        }
        await db.collection('messages').insertOne({
            from: user,
            to: req.body.to, 
            text: req.body.text, 
            type: type, 
            time: dayjs().format('HH:mm:ss')
        })

        res.sendStatus(201)

    } catch (err) {
        res.status(500)
    }

})

app.get("/messages", async (req, res) => {

    const limit = req.query.limit
    const user = req.headers.user
    const showMessages = []

    try{

        const messages = await db.collection('messages').find().toArray()

        if(limit){
            for(let i=0; i<limit; i++){
                if(messages[i].to === user || messages[i].to === 'Todos' || messages[i].from === user){
                    showMessages.push(messages[i])
                }
            }
            res.send(showMessages)
            return
        }

        messages.forEach(message => {
            if(message.to === 'Todos' || message.to === user || message.from === user){
                showMessages.push(message)
            }
        });

        res.send(showMessages)

    } catch (err) {

        res.status(500)
    }
})

app.post("/status", async (req, res) => {

    const user = req.headers.user
    const isOnline = await db.collection('participants').findOne({name:user})

    if(!isOnline){
        res.sendStatus(404)
        return
    }

    try {

        await db.collection('participants').updateOne({name: user}, {$set:{name: user, lastStatus:Date.now()}})
        res.sendStatus(200)

    } catch (err) {

        res.status(500)
    }

})

async function clearParticipants () {
    
    const clearList = []
    const participants = await db.collection('participants').find().toArray()

    participants.forEach(element => {
        ((Date.now() - element.lastStatus) > 10000) && clearList.push(element)
    });

    if (clearList === 0){
        return
    }

    try{
        for(let i=0; i<clearList.length; i++){
            await db.collection('participants').deleteOne({name:clearList[i].name})
            await db.collection('messages').insertOne({
                from: clearList[i].name,
                to:'Todos',
                text: 'sai da sala...',
                type: 'status',
                time: dayjs().format('HH:mm:ss')
            })
        }
        res.sendStatus(400)
        
    } catch (err) {
        return
    }
}   


app.delete("/messages/:ID_DA_MENSAGGEM", async (req, res)=>{

    const messageId = req.params.ID_DA_MENSAGGEM
    const user = req.headers.user

    const message = await db.collection('messages').findOne({_id:ObjectId(messageId)})

    if(!message){
        res.sendStatus(404)
        return
    }

    if(user !== message.from){
        res.sendStatus(401)
        return
    }

    try {
        await db.collection('messages').deleteOne({_id:ObjectId(messageId)})
        res.sendStatus(200)
    } catch (err) {
        return
    }
})

setInterval(clearParticipants, 15000)


app.listen(5000)