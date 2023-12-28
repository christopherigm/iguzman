import React from 'react';
import { useSelector } from 'react-redux';
import ContactItem from 'src/modules/contact/contact-item';
import Title from 'src/modules/title/title';
import 'src/modules/contact/contact.scss';

const getReadableAddress = ( a: any ) => {
  if ( !a || !a.attributes || !a.relationships ) return '';
  const street = a.attributes.street;
  const ext_number = a.attributes.ext_number;
  const local_region = a.attributes.local_region;
  const zip_code = a.attributes.zip_code;
  const city = a.relationships && a.relationships.city ?
    a.relationships.city : null;
  const state = city ? city.data.relationships.state : null;

  return `${street} ${ext_number}, ${local_region}, ${zip_code} ${city.data.attributes.name}, ${state.data.attributes.name}, Mexico.`;
};

const Contact = (): React.ReactElement => {
  const pageData = useSelector((state: any) => state.page);
  const pageAttr: any = pageData.data ? pageData.data.attributes ? pageData.data.attributes : {} : {};
  const pageRel: any = pageData.data ? pageData.data.relationships ? pageData.data.relationships : {} : {};
  const address = pageRel && pageRel.address && pageRel.address.data ? pageRel.address.data : null;
  const readableAddress = getReadableAddress(address);

  return (
    <div className='Contact'>
      <Title
        color='white'
        text='Solefi a un click'
        shadow={true} />
      <div className='container row Contact__info'>
        <div className='col s12 m4 Contact__block'>
          <ContactItem
            link={`https://maps.google.com/?q=${readableAddress}/`}
            icon='location_on'
            tile='Visítanos en'
            text={readableAddress}
            linkText='Click Aquí'/>
        </div>
        <div className='col s12 m4 Contact__block'>
          <ContactItem
            link={`tel:${pageAttr.main_phone}`}
            icon='local_phone'
            tile='Llámanos al'
            text={pageAttr.main_phone}
            linkText='Click Aquí'/>
        </div>
        <div className='col s12 m4 Contact__block'>
          <ContactItem
            link={`mailto:${pageAttr.email}`}
            icon='email'
            tile='Escríbenos a'
            text={pageAttr.email}
            linkText='Click Aquí'/>
        </div>
      </div>
    </div>
  );
};

export default Contact;
