exports.handler = async (event: any) => {
  const headers: string[] = event.detail.headers;

  console.log("headers");
  console.log(headers.join(", "));

  const data: string = event.detail.data;
  console.log("data");
  console.log(JSON.stringify(data, null, 2));

  let transformedObject: any = {};

  for (let index in headers) {
    transformedObject[headers[index]] = data[index];
  }

  console.log(JSON.stringify(transformedObject, null, 2));
  return { Object: transformedObject };
};
