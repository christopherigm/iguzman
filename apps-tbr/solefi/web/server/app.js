/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
require('dotenv').config();
const express = require('express');
const exphbs = require('express-handlebars');

const port = 3000;
const app = express();

app.use('/static', express.static('/static'));
app.use('/assets', express.static('/assets'));

const hbs = exphbs.create({
  helpers: {
    escapeJS: ( data ) => {
      return JSON.stringify( data );
    }
  },
  extname: '.hbs'
});
app.engine('.hbs', hbs.engine);
app.set('view engine', '.hbs');
app.enable('view cache');
app.locals.layout = false;

const commonIndex = (req, res) => {
  return res.render('index', {
    seo: {
      title: 'Solefi',
      og_title: 'Solefi',
      og_description: 'Asesores de negocios',
      img_og_picture: '/assets/parallaxbackground.jpg',
      og_site_name: 'Solefi',
      url: '/',
      keywords: 'Solefi,negocios'
    }
  });
};

app.get('/activate/:token', commonIndex);
app.get('/about', commonIndex);
app.get('/', commonIndex);

app.listen(port, () => {
  console.log(`App listening on port ${port}!`);
});
