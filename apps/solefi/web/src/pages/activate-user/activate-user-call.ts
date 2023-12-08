import { APIPost } from 'src/api/communicator';

const ActivateUserCall = ( token: string ): Promise<any> => {
  return new Promise((res, rej) => {
    const url = 'activate-user';
    const data = {
      data: {
        type: 'ActivateUser',
        attributes: {
          token: token
        }
      }
    };
    APIPost( url, data )
      .then((d: any) => {
        const response = { ...d };
        return res(response);
      })
      .catch((error) => {
        rej(error);
      });
  });
};

export default ActivateUserCall;
