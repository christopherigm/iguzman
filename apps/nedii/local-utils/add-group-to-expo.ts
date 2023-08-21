import {Patch} from 'utils';
import type {
  ExpoInterface,
  GroupInterface
} from 'interfaces/stand-interface';
import GetExpoByID from './get-expo-by-id';

type Props = {
  URLBase: string;
  expoID: number;
  groupID: number;
};

type Response = {
  data: ExpoInterface;
};

type GroupInterfaceRelationship = {
  type: 'Group';
  id: number;
};

const AddGroupToExpoAPI = ({
    URLBase,
    expoID,
    groupID,
  }: Props ): Promise<ExpoInterface> => {
  return new Promise((res, rej) => {
    GetExpoByID({
      URLBase,
      id: expoID,
    })
      .then((expo: ExpoInterface) => {
        const url = `${URLBase}/v1/expos/${expoID}/`;
        const groups: Array<GroupInterfaceRelationship> = expo.relationships?.groups.data || [];
        groups.push({
          type: 'Group',
          id: groupID,
        });
        return Patch({
          url,
          data: {
            type: 'Expo',
            id: expoID,
            relationships: {
              groups: {
                data: groups
              }
            }
          }
        });
      })
        .then((response: Response) => res(response.data))
        .catch(error => rej(error));
  });
};

export default AddGroupToExpoAPI;
