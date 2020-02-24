# Astro Cloudformation Schema Generator

Yeoman generator for building Cloudformation schema for AWS Resources.
\*\*\*\*This generator provides basic cloudformation schema, please validate it before using it

## Getting Started

Install:

```bash
npm install -g yo generator-astro-cloudformation
```

```bash
yo astro-cloudformation
```

Setup base resources folder inside your project directory, where every resources schema will be generated

### Generator CLI

Generate a new variables:

```
yo astro-cloudformation:variable
```

Generate a new S3 policy schema:

```
yo astro-cloudformation:s3-policy
```

Generate a new S3 bucket schema:

```
yo astro-cloudformation:s3
```

Generate a new security group schema:

```
yo astro-cloudformation:sg
```

Generate a new rds schema:

```
yo astro-cloudformation:rds
```

Generate a new dynamodb schema:

```
yo astro-cloudformation:dynamo
```

## License

[MIT License](README.md) - [Rahul Khanna](https://github.com/khanna91)
