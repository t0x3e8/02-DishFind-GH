require('dotenv').config();
var express = require('express');
var router = express.Router();
var multer  = require('multer');
var OpenAI = require('openai');
var fs = require('fs');

//* Multer setup */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, file.fieldname + '-' + uniqueSuffix)
  }
})

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 1 * 1024 * 1024 } // 1MB
})

/* OpenAI setup */
const openai = new OpenAI({
  organization: process.env.ORGANIZATION,
  project: process.env.PROJECT,
  apiKey: process.env.API_KEY
});


//* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Find the dish!' });
});


//* POST upload a file. */
router.post('/', upload.single('file'), async function(req, res, next) {
  if (!req.file) {
    return res.status(400).send('No file uploaded or file size too large.');
  }

  const base64Image = fs.readFileSync(req.file.path, 'base64');

  try {
    const modelResponse = await processMenuImage(base64Image);
    const cleanedResult = modelResponse.replace(/^```json\n|\n```$/g, '');
    const jsonObject = JSON.parse(cleanedResult);

    const dishes = jsonObject.dishes.map(dish => ({
      name: dish.name,
      price: dish.price
    }));

    res.render('result', { data: dishes , title: "Find the dish!"});
  } catch (err) {
    console.error("Error processing file with OpenAI:", err);
    res.status(500).send('Error processing the file with OpenAI.');
  }
});

async function processMenuImage(base64Image) {
  const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
          { 
              role: "user", 
              content: [
                  {
                      type: "text",
                      text: "Załączam menu restauracji. Sprawdź, czy w menu znajdują się dania: tatar, pizza lub spaghetti. Jeżeli któreś z tych dań są dostępne, zwróć wszystkie pasujące dania w formacie JSON o strukturze: { name: 'dish_name', price: 'dish_price' }. Jeżeli żadne z tych dań nie są dostępne, zwróć pusty obiekt {}" 
                  },
                  {
                      type: "image_url",
                      image_url: { url: `data:image/jpeg;base64,${base64Image}` } 
                    }],
                  }],
      stream: true,
      max_tokens: 300
  });

  let modelResponse = '';
  for await (const chunk of stream) {
      modelResponse += chunk.choices[0]?.delta?.content || "";
  }

  return modelResponse;
}

module.exports = router;
