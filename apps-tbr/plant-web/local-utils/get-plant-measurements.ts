import {
  API,
  RebuildData
} from 'utils';

type Props = {
  URLBase: string;
  plantID: number;
  pageSize?: number;
};

const GetPlantMeasurements = ({
    URLBase,
    plantID,
    pageSize = 30
  }: Props ): Promise<any> => {
  return new Promise((res, rej) => {
    const filters = `filter[plant]=${plantID}&`;
    const sorting = `sort=-id&`;
    const size = `page[size]=${pageSize}&`;
    const parameters = filters + sorting + size;
    const url = `${URLBase}/v1/measurements/?${parameters}`;
    API.Get({url})
      .then(response => {
        res(RebuildData(response).data)
      })
      .catch(error => rej(error));
  });
};

export default GetPlantMeasurements;
