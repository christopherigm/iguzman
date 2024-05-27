import { ReactElement } from 'react';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Stand from 'classes/stand';
import CategorySelector from 'components/companies/category-selector';
import Category from 'classes/category';
import ExpoSelector from 'components/companies/expo-selector';
import Expo from 'classes/expo';
import { useEffect } from '@preact-signals/safe-react/react';

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
  useEffect(() => {
    if (stand.relationships.category.data.id) {
      onComplete();
    }
  }, []);

  return (
    <>
      <CategorySelector
        URLBase={URLBase}
        categorySelectedID={stand.relationships.category.data.id ?? 0}
        onSelect={(category: Category) => {
          stand.relationships.category.data.id = category.id;
          stand.relationships.category.data.attributes = category.attributes;
          onIncomplete();
        }}
      />
      {stand.relationships.category.data.id ? (
        <>
          <Box marginTop={3} marginBottom={2}>
            <Divider />
          </Box>
          <ExpoSelector
            URLBase={URLBase}
            groupID={stand.relationships.category.data.id}
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
