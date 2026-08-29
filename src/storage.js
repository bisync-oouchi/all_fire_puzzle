const memory=new Map();

export const storage={
  getItem(key){try{return localStorage.getItem(key)}catch{return memory.get(key)??null}},
  setItem(key,value){const text=String(value);memory.set(key,text);try{localStorage.setItem(key,text)}catch{}},
  removeItem(key){memory.delete(key);try{localStorage.removeItem(key)}catch{}}
};
