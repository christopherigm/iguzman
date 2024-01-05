const GetDatesDifference = (initial: string, final: string) => {
  const diff = new Date(Date.parse(final) - Date.parse(initial));
  const years = diff.getFullYear() - 1970;
  const months = diff.getMonth();
  let text = '';
  if (years) text += `${years} y${years === 1 ? '' : 'rs'}`;
  if (months)
    text += `${years ? ', ' : ''}${months} m${months === 1 ? '' : 'os'}`;
  return {
    text,
    years,
    months,
  };
};

export default GetDatesDifference;
