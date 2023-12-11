import React from 'react';
import { useSelector } from 'react-redux';

const ClientAccess = (): React.ReactElement => {
  const pageData = useSelector((state: any) => state.page);
  const pageAttr: any = pageData.data ? pageData.data.attributes ? pageData.data.attributes : {} : {};

  return (
    <a
      href={pageAttr.platform_link}
      target='_blank'
      rel='noreferrer'
      className='waves-effect btn blue lighten-2 white-text ClientAccess'>
      <i className='material-icons right white-text'>vpn_key</i>
      Clientes
    </a>
  );
};

export default ClientAccess;
