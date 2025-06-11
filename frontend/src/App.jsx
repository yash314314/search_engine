import React from 'react';
import Search from './components/Search';

function App() {
  return (
    <div children="bg-gray-800 dark:bg-gray-900 min-h-screen py-10 px-4">
      <h1 className='bg-gray-900 text-4xl text-white flex justify-center items-center '>🔍 Blog Search</h1>
      <Search />
    </div>
  );
}

export default App;
