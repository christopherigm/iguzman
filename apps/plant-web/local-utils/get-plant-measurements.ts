import {
  API,
  RebuildData
} from 'utils';

type Props = {
  URLBase: string;
  id: number;
};

const GetPlantMeasurements = ({
    URLBase,
    id
  }: Props ): Promise<any> => {
  return new Promise((res, rej) => {
    const pageSize = `filter[plant]=${id}&page[size]=50&sort=-id`;
    const parameters = pageSize;
    const url = `${URLBase}/v1/measurements/?${parameters}`;
    API.Get({url})
      .then(response => {
        res(RebuildData(response).data)
      })
      .catch(error => rej(error));
  });
};

export default GetPlantMeasurements;
