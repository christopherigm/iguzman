import { ReactElement, FormEvent, useEffect } from 'react';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Stand from 'classes/stand';
import GroupSelector from 'components/companies/group-selector';
import Group from 'classes/group';
import ExpoSelector from 'components/companies/expo-selector';
import Expo from 'classes/expo';

type Props = {
  darkMode: boolean;
  URLBase: string;
  stand: Stand;
  onCancel: () => void;
  onIncomplete: () => void;
  onComplete: () => void;
};

const CompanyFormExpoInfo = ({
  darkMode = false,
  URLBase,
  stand,
  onCancel,
  onIncomplete,
  onComplete,
}: Props): ReactElement => {
  return (
    <>
      <GroupSelector
        URLBase={URLBase}
        groupSelectedID={stand.relationships.group.data.id ?? 0}
        onSelect={(group: Group) => {
          stand.relationships.group.data.id = group.id;
          stand.relationships.group.data.attributes = group.attributes;
          onIncomplete();
        }}
      />
      {stand.relationships.group.data.id ? (
        <>
          <Box marginTop={3} marginBottom={2}>
            <Divider />
          </Box>
          <ExpoSelector
            URLBase={URLBase}
            groupID={stand.relationships.group.data.id}
            expoSelectedID={stand.relationships.expo.data.id ?? 0}
            onSelect={(expo: Expo) => {
              stand.relationships.expo.data.id = expo.id;
              stand.relationships.expo.data.attributes = expo.attributes;
              onComplete();
            }}
          />
        </>
      ) : null}
    </>
  );
};

export default CompanyFormExpoInfo;
