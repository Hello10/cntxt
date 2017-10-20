function buildEnum (types) {
  return types.reduce((Types, type)=> {
    Types[type] = type;
    return Types;
  }, {});
}

function capitalize (string) {
  let first = string.charAt(0).toUpperCase();
  let rest = string.slice(1);
  return `${first}${rest}`;
}

module.exports = {
  buildEnum,
  capitalize
};  
